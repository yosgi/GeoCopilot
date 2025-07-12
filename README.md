# GeoCopilot: AI-powered 3D BIM Digital Twin Assistant

GeoCopilot is an AI assistant for controlling a 3D BIM (Building Information Modeling) digital twin scene using natural language commands. It leverages OpenAI's GPT models (via LangChain) and provides a seamless way to manage scene layers, camera, and more, all through conversational instructions.

## Features

- **Natural Language Control**: Hide/show layers, adjust transparency, focus camera, and more, just by talking to the AI.
- **Layer Management**: Instantly control BIM, terrain, imagery, and other layers.
- **Scene Context Awareness**: The AI always knows the current scene state and available layers.
- **Extensible Tooling**: Easily add new tools (e.g., camera, measurement) for more advanced scene operations.
- **Modern UI**: Built with React, CesiumJS, and Vite for fast development and beautiful 3D visualization.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/yosgi/GeoCopilot.git
cd GeoCopilot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root with your OpenAI API key:

```
VITE_OPENAI_API_KEY=sk-xxxxxxx
```

**Important:**  
Never commit your `.env` file or API keys to version control!

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## How to Use

- Type or speak natural language commands in the AI chat box, e.g.:
  - "Hide the Site layer"
  - "Show only the Architecture and Facade layers"
  - "Set the opacity of the Facade to 50%"
  - "Show all BIM layers"
- The AI will interpret your request and control the 3D scene accordingly.
- You can also use the manual layer control panel for direct toggling.

## Development

- The main logic for AI command parsing is in `src/agents/GeoCopilotAgent.ts`.
- Layer control tools are in `src/tools/layerControl.ts`.
- Scene state and Cesium integration are managed in `src/hooks/useSceneContext.ts` and `src/hooks/useGeoCopilot.ts`.
- To add new AI tools, follow the LangChain tool interface and register them in the agent.

## Security

- **Never commit secrets**: `.env` is in `.gitignore` by default.
- If you accidentally commit a secret, follow [GitHub's guide](https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning/removing-a-secret-from-your-repositorys-history) to remove it from history.

## License

MIT
