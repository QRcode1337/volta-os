import OpenAI from 'openai'

let _openaiClient: OpenAI | null = null

function getOpenAIClient() {
  if (_openaiClient) return _openaiClient

  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY environment variable. Make sure it is set in .env')
  }

  _openaiClient = new OpenAI({ apiKey })
  return _openaiClient
}

/**
 * OpenAI client for embeddings and completions
 * Lazy-loaded to ensure environment variables are available
 */
export const openai = new Proxy({} as OpenAI, {
  get(target, prop) {
    const client = getOpenAIClient()
    return (client as any)[prop]
  }
})

/**
 * Generate embeddings for text using text-embedding-3-small
 * @param text - Text to embed
 * @returns 1536-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536
  })

  return response.data[0].embedding
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts - Array of texts to embed
 * @returns Array of 1536-dimensional embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient()
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
    dimensions: 1536
  })

  return response.data.map(item => item.embedding)
}
