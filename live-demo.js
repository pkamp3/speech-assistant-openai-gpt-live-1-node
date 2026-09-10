import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';

dotenv.config();

const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
    console.error('Missing OpenAI API key. Please set it in the .env file.');
    process.exit(1);
}

const MODEL = 'gpt-live-1';
const DELEGATED_MODEL = 'gpt-5.6-terra';
const VOICE = 'marin';
const USER_AGENT = 'twilio-demos/Node 1.0.0';
const PORT = process.env.PORT || 5050;

const OPENING = "Hi there! I am an AI voice assistant powered by Twilio and OpenAI's GPT-Live. How can I help?";
const VOICE_PROMPT = "You are an AI voice assistant powered by Twilio and OpenAI's GPT-Live. "
    + 'Never call yourself ChatGPT. '
    + 'You are helpful and bubbly, love to chat about anything the caller is interested in, and are prepared to offer facts. '
    + 'You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. '
    + 'Always stay positive, but work in a joke when appropriate. '
    + 'You can look up the top headline for any city, and you can search the web for real facts. '
    + 'If the caller asks what you can do, tell them those two things. '
    + 'Name the city you are looking up so the lookup is unambiguous.';
const BACKEND_PROMPT = 'Use get_top_headline for the local headline of the day and web_search for real facts. '
    + 'Answer in one or two sentences.';

const TOOLS = [
    { type: 'web_search' },
    {
        type: 'function',
        name: 'get_top_headline',
        description: "Get today's top headline for a city.",
        parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
            additionalProperties: false
        }
    }
];

const HEADLINES = [
    'Fusion plant comes online; residents petition to have it moved next to the airport',
    'Traffic permanently solved by new roundabout. 400 citizens now on their third hour circling it',
    'Mayor renames every street "Main Street"',
    'Godzilla attack downgraded to "moderate inconvenience" by tourism board',
    'City votes to replace bus network with a single party bike',
    'New arcology opens to complaints the clouds are too close',
    'Water treatment plant water rated "mostly delicious" by local food critic',
];

// Mock tool call with fake data, slow on purpose.
const getTopHeadline = async ({ city }) => {
    console.log('Reticulating splines...');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return { city, headline: HEADLINES[Math.floor(Math.random() * HEADLINES.length)] };
};

const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

fastify.get('/', async () => ({ message: 'Twilio Media Stream Server is running!' }));

fastify.all('/incoming-call', async (request, reply) => {
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    reply.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Connect><Stream url="wss://${host}/media-stream" /></Connect></Response>`);
});

fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, (connection) => {
        console.log('Client connected');

        let streamSid = null;
        let sessionRequested = false;
        let sessionReady = false;

        const openAiWs = new WebSocket('wss://api.openai.com/v1/live/sessions', {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                'User-Agent': USER_AGENT
            }
        });

        const send = (event) => {
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.send(JSON.stringify(event));
        };
        const close = () => {
            sessionReady = false;
            connection.close();
            openAiWs.close();
        };

        // Wait for Twilio's stream ID before starting the session.
        const startSession = () => {
            if (sessionRequested || !streamSid || openAiWs.readyState !== WebSocket.OPEN) return;
            sessionRequested = true;
            send({ type: 'session.start', session: {
                model: MODEL,
                instructions: VOICE_PROMPT,
                audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice: VOICE } },
                delegation: {
                    type: 'responses',
                    responses: { model: DELEGATED_MODEL, instructions: BACKEND_PROMPT, tools: TOOLS }
                }
            } });
        };

        openAiWs.on('open', () => {
            console.log('Connected to GPT-Live-1');
            startSession();
        });

        openAiWs.on('message', async (data) => {
            try {
                const event = JSON.parse(data);

                if (event.type === 'session.started') {
                    sessionReady = true;
                    // Quote this ID if you ever need OpenAI's help with a call.
                    console.log('GPT-Live-1 session', event.session?.id);
                    send({ type: 'session.instructions.append', delegation_id: null,
                        content: `Your first spoken line on this call is, verbatim: "${OPENING}"` });
                    send({ type: 'session.commentary.append', delegation_id: null, content: OPENING });
                } else if (event.type === 'session.output_audio.delta' && streamSid && connection.readyState === WebSocket.OPEN) {
                    connection.send(JSON.stringify({ event: 'media', streamSid, media: { payload: event.delta } }));
                } else if (event.type === 'response.event'
                    && event.event?.type === 'response.output_item.done'
                    && event.event.item?.type === 'function_call' && event.event.item.status === 'completed') {
                    const { call_id, name, arguments: args } = event.event.item;
                    console.log('Tool call:', name, args);
                    const output = name === 'get_top_headline'
                        ? await getTopHeadline(JSON.parse(args))
                        : { error: 'unknown tool' };
                    send({ type: 'response.item.create',
                        item: { type: 'function_call_output', call_id, output: JSON.stringify(output) } });
                    send({ type: 'response.create' });
                } else if (event.type === 'session.output_transcript.delta') {
                    console.log('Assistant:', event.delta);
                } else if (event.type === 'error') {
                    console.error('GPT-Live-1 error:', event.error);
                }
            } catch (error) { console.error('Error processing the GPT-Live-1 message:', error); }
        });

        connection.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.event === 'media' && sessionReady && openAiWs.readyState === WebSocket.OPEN) {
                    send({ type: 'session.input_audio.append', audio: data.media.payload });
                } else if (data.event === 'start') {
                    streamSid = data.start.streamSid;
                    console.log('Incoming stream has started', streamSid);
                    startSession();
                } else if (data.event === 'stop') {
                    close();
                }
            } catch (error) { console.error('Error parsing Twilio message:', error); }
        });

        connection.on('close', () => { close(); console.log('Client disconnected.'); });
        connection.on('error', close);
        openAiWs.on('close', (code, reason) => {
            close();
            console.log('Disconnected from GPT-Live-1', code, reason.toString());
        });
        openAiWs.on('error', (error) => { console.error('Error in the OpenAI WebSocket:', error); close(); });
    });
});

fastify.listen({ port: PORT }, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`Server is listening on port ${PORT}`);
});