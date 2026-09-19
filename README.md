# AI Chat PDF

A lightweight Node.js backend for experimenting with Retrieval-Augmented Generation (RAG) over PDF documents.

The project takes a PDF, extracts its text, splits the text into fixed-size chunks, converts those chunks into vector embeddings, stores the vectors in Qdrant, retrieves the most relevant chunk for a user question, and sends that retrieved context to a Gemini generative model to produce an answer.

The project is intentionally simple and educational: the goal is to understand the individual building blocks of a RAG pipeline and experiment with different embedding and LLM models.

## How the RAG pipeline works

```text
PDF
 ↓
Multer upload
 ↓
pdf-parse
 ↓
Text extraction + basic cleaning
 ↓
Fixed-size chunking
 ↓
Embedding model
 ↓
Qdrant vector database
 ↓
Similarity search
 ↓
Most relevant chunk
 ↓
Gemini LLM
 ↓
Answer
```

### 1. PDF ingestion

The `POST /upload` endpoint accepts a PDF in the `pdf` multipart/form-data field.

The uploaded file is temporarily stored by Multer and then parsed with pdf-parse to extract its text. The temporary file is removed after extraction.

### 2. Text cleaning and chunking

The extracted text goes through basic cleanup, including removal of common page-number patterns.

The current implementation uses fixed-size chunking based on 100 words per chunk:

```text
Document text
   ↓
100 words
   ↓
100 words
   ↓
100 words
   ↓
...
```

This is deliberately simple. It leaves room for experimenting with sentence-based, paragraph-based, or semantic chunking.

### 3. Embeddings

Each chunk is converted into a vector embedding using Google's Gemini embedding API.

Current embedding model:

```text
gemini-embedding-2
```

The resulting vectors are stored along with the original chunk text.

> `@huggingface/transformers` is also included in the project dependencies for experimenting with local/open-source model inference and embeddings. The current `index.js` implementation does not use it yet.

### 4. Vector storage and retrieval

The project uses Qdrant as the vector database.

The current implementation creates a collection named:

```text
pdf-docs
```

The collection is configured for:

- Vector size: `768`
- Distance metric: `Cosine`

When a question is received, the question is embedded using the same embedding function and Qdrant is queried for the closest vector.

The current implementation retrieves one matching chunk.

### 5. LLM generation

The retrieved chunk is passed to a Gemini generative model together with the user's question.

The prompt instructs the model to answer using only the retrieved context.

Current generation model:

```text
gemini-3.8-flash
```

The generated answer is returned directly from the API.

## API endpoints

### `POST /upload`

Uploads a PDF and asks a question against that document.

Form field:

```text
pdf=<PDF file>
```

JSON body:

```json
{
  "question": "What is this document about?"
}
```

The response is the generated answer from the Gemini model.

### `POST /create-collection`

Creates the Qdrant collection used by the application.

Collection configuration:

```text
Name: pdf-docs
Vector size: 768
Distance: Cosine
```

The `/upload` flow currently recreates the collection itself, so this endpoint is mainly useful for manual experimentation.

## Tech stack

| Technology | Role |
| --- | --- |
| Node.js | Runtime |
| Express | HTTP API |
| Multer | PDF upload handling |
| pdf-parse | PDF text extraction |
| Google GenAI SDK | Gemini embeddings and text generation |
| Gemini Embedding | Text and query embeddings |
| Qdrant | Vector database and similarity search |
| Hugging Face Transformers | Open-source/local model experimentation |
| dotenv | Environment variable loading |
| CORS | Cross-origin request support |

## Environment variables

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
```

Do not commit the `.env` file.

## Getting started

### 1. Clone the repository

```bash
git clone https://github.com/prithvikings/aichatpdf.git
cd aichatpdf
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create `.env` and add the required Gemini and Qdrant credentials.

### 4. Start the server

```bash
node index.js
```

The server runs on:

```text
http://localhost:3000
```

## Example request

Using a multipart-capable API client such as Postman:

- upload `dummy-pdf_2.pdf` using the `pdf` field
- provide a `question` field containing the question you want to ask

The endpoint is:

```text
POST http://localhost:3000/upload
```

## Project structure

```text
aichatpdf/
├── index.js            # Express server and RAG pipeline
├── package.json        # Project dependencies
├── package-lock.json   # Locked dependency versions
├── dummy-pdf_2.pdf     # Sample PDF for local testing
├── uploads/            # Temporary uploaded files (ignored by Git)
└── .env                # Local secrets (ignored by Git)
```

## Current limitations

This is an experimental RAG backend rather than a production-ready document QA system.

The current implementation:

- processes the uploaded document during the same request
- uses fixed-size 100-word chunks
- retrieves only the single closest chunk
- recreates the Qdrant collection during the upload flow
- stores chunk text as Qdrant payload
- does not persist document/session metadata
- does not include a frontend
- does not yet use Hugging Face Transformers in the active RAG path
- does not implement conversation memory or multi-turn chat

These limitations are useful areas for further experimentation.

## Learning roadmap

```text
Fixed-size chunking
        ↓
Better chunking strategies
        ↓
Metadata + document IDs
        ↓
Top-k retrieval
        ↓
Reranking
        ↓
Hybrid search
        ↓
Conversation memory
        ↓
Multiple documents
        ↓
Local/open-source embeddings
        ↓
Local/open-source LLMs
        ↓
Production-ready RAG API
```

## Core idea

RAG is about retrieving relevant external context before asking the language model to generate an answer.

```text
User question
      ↓
Question embedding
      ↓
Vector search
      ↓
Relevant document context
      ↓
LLM
      ↓
Grounded answer
```

This project is a small playground for learning how PDF ingestion, chunking, embeddings, vector search, and LLM generation fit together in a practical RAG system.

## License

This project is intended for learning and experimentation.
