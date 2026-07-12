import { registerBridgeTools } from './src/bridge.js';

const plugin = {
  id: 'slonaide',
  name: 'AideNote',
  description: 'AideNote recording notes and OpenClaw remote bridge',
  register(api) {
    registerBridgeTools(api);
  }
};

export default plugin;