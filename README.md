# Twilio Voice + OpenAI GPT-Live-1 sample agents (Node.js)

Node.js samples that pair Twilio Programmable Voice and Media Streams with OpenAI's [GPT-Live-1](https://openai.com/api/voice). 

- **[`live-demo.js`](./live-demo.js) — inbound.** A Twilio phone number that answers calls with an AI voice assistant. Walkthrough: [Build an AI Voice Assistant with Twilio Voice and Media Streams, OpenAI's GPT-Live-1, and Node.js](https://www.twilio.com/en-us/blog/developers/tutorials/integrations/voice-ai-assistant-openai-gpt-live-1-node).
- **[`outbound-demo.js`](./outbound-demo.js) — outbound.** The same GPT-Live-1 assistant, this time placing a call to you. Walkthrough: [Make Outbound Calls with Twilio Voice and Media Streams, GPT-Live-1 in the OpenAI API, and Node.js](https://www.twilio.com/en-us/blog/developers/tutorials/integrations/outbound-calls-openai-gpt-live-1-node).

## Prerequisites

- A [Twilio account](https://www.twilio.com/try-twilio) with a voice-capable phone number.
- An OpenAI account with access to `gpt-live-1` and a Responses-API delegation model (the samples use `gpt-5.6-terra`).
- Node.js 22 or later.
- A tunnel to expose localhost (e.g. [ngrok](https://ngrok.com)) — required for both demos.

## Setup

```bash
git clone <this-repo>
cd speech-assistant-openai-gpt-live-node
npm install
cp .env.example .env
# fill in your .env
```

## Run

### Inbound

```bash
node live-demo.js
```

Then point your Twilio number's Voice webhook at `https://<your-tunnel>/incoming-call` (HTTP POST). Dial the number.

### Outbound

```bash
node outbound-demo.js --call=+1YOURMOBILE
```

Places a call from `PHONE_NUMBER_FROM` to the number given. The target must be a Twilio number you own or a verified caller ID on your account. See the outbound tutorial for the full setup.

## License

[MIT](./LICENSE).
