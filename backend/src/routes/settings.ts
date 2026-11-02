import { FastifyInstance } from 'fastify';
import { AIProvider, GroqProvider } from '@hospital/ai-provider';

export async function settingsRoutes(fastify: FastifyInstance, aiProvider: AIProvider) {
  // Get AI engine configuration & health
  const getSettingsHandler = async (req: any, reply: any) => {
    const health = await aiProvider.healthCheck();

    return {
      provider: aiProvider instanceof GroqProvider ? 'groq' : 'ollama',
      baseUrl: (aiProvider as any).baseUrl || (aiProvider instanceof GroqProvider ? 'https://api.groq.com/openai/v1' : 'http://localhost:11434'),
      serverRunning: health.serverRunning,
      selectedModel: health.selectedModel,
      requestedModel: health.requestedModel,
      modelAvailable: health.modelAvailable,
      installedModels: health.models,
      error: health.error,
    };
  };

  fastify.get('/api/settings/ollama', getSettingsHandler);
  fastify.get('/api/settings/ai', getSettingsHandler);

  // Switch selected model
  const switchModelHandler = async (req: any, reply: any) => {
    const { model } = (req.body as any) || {};

    if (!model || typeof model !== 'string') {
      return reply.status(400).send({ error: 'model parameter is required' });
    }

    // Verify model exists in installed list
    try {
      const installed = await aiProvider.listModels();
      const matches = installed.some((m) => m === model || m.startsWith(`${model}:`));

      if (!matches) {
        return reply.status(404).send({
          error: `Model '${model}' is not available in the AI provider. Available models: [${installed.join(', ')}].`,
          installedModels: installed,
        });
      }

      aiProvider.setModel(model);

      return {
        message: `Active AI model successfully switched to '${model}'.`,
        selectedModel: model,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to configure model: ${err.message}` });
    }
  };

  fastify.post('/api/settings/ollama/model', switchModelHandler);
  fastify.post('/api/settings/ai/model', switchModelHandler);

  // Test inference button endpoint
  const testInferenceHandler = async (req: any, reply: any) => {
    const start = Date.now();
    try {
      const result = await aiProvider.generate({
        messages: [
          { role: 'system', content: 'You are a hospital AI test assistant.' },
          { role: 'user', content: 'Respond with a single concise sentence confirming the hospital AI inference pipeline is healthy and active.' },
        ],
        temperature: 0.1,
        timeoutMs: 15000,
      });

      return {
        success: true,
        model: result.model,
        durationMs: Date.now() - start,
        response: result.content,
      };
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        durationMs: Date.now() - start,
        error: `Inference test failed: ${err.message || String(err)}`,
      });
    }
  };

  fastify.post('/api/settings/ollama/test', testInferenceHandler);
  fastify.post('/api/settings/ai/test', testInferenceHandler);
}
