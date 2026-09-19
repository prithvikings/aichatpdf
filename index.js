const express = require("express");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const { PDFParse } = require("pdf-parse");
const { GoogleGenAI } = require("@google/genai");
const { QdrantClient } = require("@qdrant/js-client-rest");

require("dotenv").config();

const app = express();

app.use(express.json());

const upload = multer({
    dest: "uploads/",
});

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

// --------------------------------------------------
// Create embedding
// --------------------------------------------------

async function createEmbedding(text) {
    const response = await ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: text,
    });

    return response.embeddings[0].values;
}

// --------------------------------------------------
// Extract text from PDF
// --------------------------------------------------

async function extractPdfText(filePath) {
    const dataBuffer = fs.readFileSync(filePath);

    const parser = new PDFParse({
        data: dataBuffer,
    });

    try {
        const pdfData = await parser.getText();

        return pdfData.text;
    } finally {
        await parser.destroy();
    }
}

// --------------------------------------------------
// Upload PDF + ask question
// --------------------------------------------------

app.post("/upload", upload.single("pdf"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send("No PDF uploaded.");
        }

        // ----------------------------------------------
        // 1. Extract PDF text
        // ----------------------------------------------

        let rawText = await extractPdfText(req.file.path);

        // ----------------------------------------------
        // 2. Delete temporary uploaded PDF
        // ----------------------------------------------

        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        // ----------------------------------------------
        // 3. Clean PDF text
        // ----------------------------------------------

        rawText = rawText.replace(
            /[-–—]\s*\d+\s*of\s*\d+\s*[-–—]/gi,
            " "
        );

        rawText = rawText.replace(/Page\s*\d+/gi, " ");

        // ----------------------------------------------
        // 4. Split into words
        // ----------------------------------------------

        const words = rawText
            .split(/\s+/)
            .filter((word) => word.trim() !== "");

        // ----------------------------------------------
        // 5. Create chunks
        // ----------------------------------------------

        const chunks = [];

        const chunkSize = 100;

        for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words
                .slice(i, i + chunkSize)
                .join(" ");

            chunks.push(chunk);
        }

        if (chunks.length === 0) {
            return res
                .status(400)
                .send("PDF contains no readable text.");
        }

        console.log(`Extracted ${words.length} words`);
        console.log(`Created ${chunks.length} chunks`);

        // ----------------------------------------------
        // 6. Recreate Qdrant collection
        // ----------------------------------------------

        try {
            await qdrant.deleteCollection("pdf-docs");
        } catch (error) {
            // Collection may not exist yet.
        }

        await qdrant.createCollection("pdf-docs", {
            vectors: {
                size: 768,
                distance: "Cosine",
            },
        });

        // ----------------------------------------------
        // 7. Create embeddings
        // ----------------------------------------------

        const embeddingPromises = chunks.map(async (chunk) => {
            const embedding = await createEmbedding(chunk);

            return {
                id: crypto.randomUUID(),

                vector: embedding,

                payload: {
                    text: chunk,
                },
            };
        });

        const points = await Promise.all(embeddingPromises);

        console.log(`Generated ${points.length} embeddings`);

        // ----------------------------------------------
        // 8. Store embeddings in Qdrant
        // ----------------------------------------------

        await qdrant.upsert("pdf-docs", {
            wait: true,
            points,
        });

        console.log("Embeddings stored in Qdrant");

        // ----------------------------------------------
        // 9. Get user's question
        // ----------------------------------------------

        const question = req.body.question;

        if (!question) {
            return res.status(400).send("No question provided.");
        }

        // ----------------------------------------------
        // 10. Create embedding for question
        // ----------------------------------------------

        const questionEmbedding = await createEmbedding(question);

        // ----------------------------------------------
        // 11. Search Qdrant
        // ----------------------------------------------

        const searchResult = await qdrant.query("pdf-docs", {
            query: questionEmbedding,
            limit: 1,
            with_payload: true,
        });

        if (
            !searchResult.points ||
            searchResult.points.length === 0
        ) {
            return res
                .status(404)
                .send("No relevant context found in the document.");
        }

        // ----------------------------------------------
        // 12. Get best matching chunk
        // ----------------------------------------------

        const bestChunk =
            searchResult.points[0].payload.text;

        console.log("Best matching chunk:");
        console.log(bestChunk);

        // ----------------------------------------------
        // 13. Ask Gemini using retrieved context
        // ----------------------------------------------

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",

            contents: `
Answer the question using only the context provided below.

Context:
${bestChunk}

Question:
${question}
            `,
        });

        // ----------------------------------------------
        // 14. Return answer
        // ----------------------------------------------

        res.send(response.text);
    } catch (err) {
        console.error(err);

        // Cleanup uploaded file if something fails
        if (
            req.file &&
            fs.existsSync(req.file.path)
        ) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).send(
            "Error processing request."
        );
    }
});

// --------------------------------------------------
// Create collection manually
// --------------------------------------------------

app.post("/create-collection", async (req, res) => {
    try {
        await qdrant.createCollection("pdf-docs", {
            vectors: {
                size: 768,
                distance: "Cosine",
            },
        });

        res.send("Collection created.");
    } catch (err) {
        console.error(err);

        res.status(500).send(
            "Failed to create collection."
        );
    }
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});