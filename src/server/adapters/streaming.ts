/**
 * Streaming LLM Adapter
 * 
 * Provides streaming text generation for all supported AI providers.
 * Extends the base provider adapter with Server-Sent Events (SSE) support.
 */

import { 
  getProviderBaseURL, 
  ProviderError,
  type NormalizedRequest,
  type NormalizedResponse,
} from './providers';

// ═══════════════════════════════════════════════════════════════
// Streaming Types
// ═══════════════════════════════════════════════════════════════

export interface StreamingOptions {
  /** Callback for each token */
  onToken?: (token: string) => void;
  /** Callback for completion */
  onComplete?: (response: NormalizedResponse) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface StreamingChunk {
  type: 'token' | 'done' | 'error';
  token?: string;
  response?: NormalizedResponse;
  error?: string;
}

export interface StreamingAdapter {
  /** Generate streaming response */
  generateStream(
    config: any,
    request: NormalizedRequest,
    options?: StreamingOptions
  ): AsyncGenerator<StreamingChunk, void, undefined>;
}

// ═══════════════════════════════════════════════════════════════
// Timeout and Retry Configuration
// ═══════════════════════════════════════════════════════════════

const STREAM_TIMEOUT_MS = 180000; // 3 minutes for streaming

// ═══════════════════════════════════════════════════════════════
// OpenAI Streaming Parser
// ═══════════════════════════════════════════════════════════════

async function* parseOpenAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<StreamingChunk, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason: string | undefined;
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        yield { type: 'error', error: 'Stream aborted' };
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          
          if (delta?.content) {
            content += delta.content;
            yield { type: 'token', token: delta.content };
          }
          
          if (json.choices?.[0]?.finish_reason) {
            finishReason = json.choices[0].finish_reason;
          }
          
          if (json.usage) {
            promptTokens = json.usage.prompt_tokens || 0;
            completionTokens = json.usage.completion_tokens || 0;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    yield {
      type: 'done',
      response: {
        content,
        finishReason,
        usage: promptTokens || completionTokens ? {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        } : undefined,
      },
    };
  } finally {
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// Claude Streaming Parser
// ═══════════════════════════════════════════════════════════════

async function* parseClaudeStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<StreamingChunk, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        yield { type: 'error', error: 'Stream aborted' };
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Claude uses event: and data: format
        if (trimmed.startsWith('event:')) continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          
          // content_block_delta contains the text
          if (json.type === 'content_block_delta' && json.delta?.text) {
            content += json.delta.text;
            yield { type: 'token', token: json.delta.text };
          }
          
          // message_start contains input tokens
          if (json.type === 'message_start' && json.message?.usage) {
            inputTokens = json.message.usage.input_tokens || 0;
          }
          
          // message_delta contains output tokens
          if (json.type === 'message_delta' && json.usage) {
            outputTokens = json.usage.output_tokens || 0;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    yield {
      type: 'done',
      response: {
        content,
        usage: inputTokens || outputTokens ? {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        } : undefined,
      },
    };
  } finally {
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// Gemini Streaming Parser
// ═══════════════════════════════════════════════════════════════

async function* parseGeminiStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<StreamingChunk, void, undefined> {
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    while (true) {
      if (signal?.aborted) {
        yield { type: 'error', error: 'Stream aborted' };
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Gemini uses newline-delimited JSON
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const json = JSON.parse(trimmed);
          
          // Extract text from candidates
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            content += text;
            yield { type: 'token', token: text };
          }
          
          // Extract usage metadata
          if (json.usageMetadata) {
            promptTokens = json.usageMetadata.promptTokenCount || promptTokens;
            completionTokens = json.usageMetadata.candidatesTokenCount || completionTokens;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    yield {
      type: 'done',
      response: {
        content,
        usage: promptTokens || completionTokens ? {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        } : undefined,
      },
    };
  } finally {
    reader.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// Streaming Adapter Factory
// ═══════════════════════════════════════════════════════════════

export async function createStreamingAdapter(
  providerType: string,
  apiKey: string,
  customBaseURL?: string
): Promise<StreamingAdapter> {
  const baseURL = getProviderBaseURL(providerType, customBaseURL);

  switch (providerType) {
    case 'openai':
    case 'custom':
      return {
        async *generateStream(config, req, options) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
          
          // Link external signal
          if (options?.signal) {
            options.signal.addEventListener('abort', () => controller.abort());
          }

          try {
            const body = {
              model: req.model,
              messages: req.messages,
              temperature: req.temperature,
              max_tokens: req.maxTokens,
              stream: true,
              stream_options: { include_usage: true },
            };

            const res = await fetch(`${baseURL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
              const errorText = await res.text().catch(() => 'Unknown error');
              throw new ProviderError(
                `OpenAI streaming error ${res.status}: ${errorText.slice(0, 500)}`,
                res.status,
                false
              );
            }

            if (!res.body) {
              throw new ProviderError('No response body for streaming', 500, true);
            }

            const reader = res.body.getReader();
            yield* parseOpenAIStream(reader, options?.signal);
          } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof ProviderError) {
              yield { type: 'error', error: error.message };
            } else if (error instanceof Error) {
              yield { type: 'error', error: error.message };
            } else {
              yield { type: 'error', error: 'Unknown streaming error' };
            }
          }
        },
      };

    case 'claude':
      return {
        async *generateStream(config, req, options) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
          
          if (options?.signal) {
            options.signal.addEventListener('abort', () => controller.abort());
          }

          try {
            const systemMessage = req.messages.find(m => m.role === 'system');
            const conversationMessages = req.messages
              .filter(m => m.role !== 'system')
              .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
              }));

            const body: Record<string, unknown> = {
              model: req.model,
              messages: conversationMessages,
              max_tokens: req.maxTokens || 4096,
              temperature: req.temperature,
              stream: true,
            };

            if (systemMessage) {
              body.system = systemMessage.content;
            }

            const res = await fetch(`${baseURL}/v1/messages`, {
              method: 'POST',
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(body),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
              const errorText = await res.text().catch(() => 'Unknown error');
              throw new ProviderError(
                `Claude streaming error ${res.status}: ${errorText.slice(0, 500)}`,
                res.status,
                false
              );
            }

            if (!res.body) {
              throw new ProviderError('No response body for streaming', 500, true);
            }

            const reader = res.body.getReader();
            yield* parseClaudeStream(reader, options?.signal);
          } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof ProviderError) {
              yield { type: 'error', error: error.message };
            } else if (error instanceof Error) {
              yield { type: 'error', error: error.message };
            } else {
              yield { type: 'error', error: 'Unknown streaming error' };
            }
          }
        },
      };

    case 'gemini':
      return {
        async *generateStream(config, req, options) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
          
          if (options?.signal) {
            options.signal.addEventListener('abort', () => controller.abort());
          }

          try {
            const geminiMessages = req.messages
              .filter(m => m.role !== 'system')
              .map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
              }));

            const systemMessage = req.messages.find(m => m.role === 'system');

            const body: Record<string, unknown> = {
              contents: geminiMessages,
              generationConfig: {
                temperature: req.temperature,
                maxOutputTokens: req.maxTokens,
              },
            };

            if (systemMessage) {
              body.systemInstruction = { parts: [{ text: systemMessage.content }] };
            }

            // Use streamGenerateContent endpoint
            const res = await fetch(
              `${baseURL}/v1beta/models/${req.model}:streamGenerateContent?alt=sse`,
              {
                method: 'POST',
                headers: {
                  'x-goog-api-key': apiKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: controller.signal,
              }
            );

            clearTimeout(timeoutId);

            if (!res.ok) {
              const errorText = await res.text().catch(() => 'Unknown error');
              throw new ProviderError(
                `Gemini streaming error ${res.status}: ${errorText.slice(0, 500)}`,
                res.status,
                false
              );
            }

            if (!res.body) {
              throw new ProviderError('No response body for streaming', 500, true);
            }

            const reader = res.body.getReader();
            yield* parseGeminiStream(reader, options?.signal);
          } catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof ProviderError) {
              yield { type: 'error', error: error.message };
            } else if (error instanceof Error) {
              yield { type: 'error', error: error.message };
            } else {
              yield { type: 'error', error: 'Unknown streaming error' };
            }
          }
        },
      };

    default:
      throw new Error(`Streaming not supported for provider: ${providerType}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// Utility: Convert AsyncGenerator to ReadableStream (for SSE)
// ═══════════════════════════════════════════════════════════════

export function streamToSSE(
  generator: AsyncGenerator<StreamingChunk, void, undefined>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          const data = JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          
          if (chunk.type === 'done' || chunk.type === 'error') {
            controller.close();
            return;
          }
        }
        controller.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`));
        controller.close();
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// Utility: Collect full response from streaming
// ═══════════════════════════════════════════════════════════════

export async function collectStream(
  generator: AsyncGenerator<StreamingChunk, void, undefined>,
  onToken?: (token: string) => void
): Promise<NormalizedResponse> {
  let response: NormalizedResponse = { content: '' };
  
  for await (const chunk of generator) {
    if (chunk.type === 'token' && chunk.token) {
      if (onToken) onToken(chunk.token);
    } else if (chunk.type === 'done' && chunk.response) {
      response = chunk.response;
    } else if (chunk.type === 'error') {
      throw new Error(chunk.error || 'Streaming error');
    }
  }
  
  return response;
}
