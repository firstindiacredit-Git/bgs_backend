require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

// Update the fetch import
import("node-fetch")
  .then(({ default: fetch }) => {
    global.fetch = fetch;
  })
  .catch((err) => console.error("Error loading node-fetch:", err));

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin with service account
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Cache duration in milliseconds (e.g., 12 hour)
const CACHE_DURATION = 4 * 60 * 60 * 1000;

const API_CONFIGS = {
  cars: {
    url: (year) => `https://api.api-ninjas.com/v1/cars?limit=100&year=${year}`,
    headers: { "X-Api-Key": "BTOsYx47SEw8rRDvct+x+g==SUy2ivypa6z9mOk1" },
  },
  stocks: {
    url: "https://finnhub.io/api/v1/stock/symbol?exchange=US&token=ctp4omhr01qhpppjiev0ctp4omhr01qhpppjievg",
    headers: {
      "Content-Type": "application/json",
    },
  },
  crypto: {
    url: "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100",
  },
  billionaires: {
    url: (year) =>
      `https://forbes400.onrender.com/api/forbes400?limit=100&year=${year}`,
  },
  movies: {
    url: "https://imdb-top-100-movies.p.rapidapi.com/",
    headers: {
      "x-rapidapi-key": "ed98e198d3msha2890b3dde9a12dp1e7caejsnf255bf4ce34c",
      "x-rapidapi-host": "imdb-top-100-movies.p.rapidapi.com",
    },
  },
  news: {
    url: "https://newsdata.io/api/1/news?apikey=pub_63909ffdc676cafdb2b6287a51da5f0e581ff&country=in&language=en",
    headers: {
      "Content-Type": "application/json",
    },
  },
  gnews: {
    url: (query) =>
      `https://gnews.io/api/v4/top-headlines?q=${query || "general"}&apikey=${
        process.env.NEWS_API_KEY
      }`,
    headers: {
      "Content-Type": "application/json",
    },
    processData: (data) => data.articles || [], // Extract articles from the response
  },
};

async function fetchAndCacheData(apiName, params = {}) {
  const baseDocRef =
    apiName === "gnews"
      ? `${apiName}-${params.query || "general"}`
      : `${apiName}-${params.year || ""}`;

  try {
    const metadataRef = db.collection("top100").doc(`${baseDocRef}-metadata`);
    const metadataDoc = await metadataRef.get();
    const now = Date.now();

    if (metadataDoc.exists) {
      const metadata = metadataDoc.data();
      if (now - metadata.timestamp < CACHE_DURATION) {
        console.log(`🚀 [${apiName}] Serving cached data for:`, baseDocRef);
        console.log(
          `Cache age: ${Math.round(
            (now - metadata.timestamp) / 1000 / 60
          )} minutes old`
        );

        if (apiName === "stocks") {
          const stocksDoc = await db
            .collection("top100")
            .doc(`${baseDocRef}-chunk-0`)
            .get();

          if (stocksDoc.exists && stocksDoc.data().items.length > 0) {
            return stocksDoc.data().items;
          }
        }
        // For other categories, continue with multiple chunks
        const chunks = [];
        for (let i = 0; i < metadata.chunks; i++) {
          const chunkDoc = await db
            .collection("top100")
            .doc(`${baseDocRef}-chunk-${i}`)
            .get();
          if (chunkDoc.exists) {
            chunks.push(...chunkDoc.data().items);
          }
        }
        console.log(`📦 Retrieved ${chunks.length} items from cache`);
        return chunks;
      } else {
        console.log(`⏰ [${apiName}] Cache expired for:`, baseDocRef);
        console.log(
          `Cache was ${Math.round(
            (now - metadata.timestamp) / 1000 / 60
          )} minutes old`
        );
      }
    } else {
      console.log(`🆕 [${apiName}] No cache found for:`, baseDocRef);
    }

    console.log(
      `🌐 [${apiName}] Fetching fresh data from API for:`,
      baseDocRef
    );
    const config = API_CONFIGS[apiName];
    const url =
      typeof config.url === "function" ? config.url(params.query) : config.url;

    const response = await fetch(url, { headers: config.headers || {} });

    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();

    // Special handling for news API response
    let processedData;
    if (apiName === "news") {
      processedData = data.results || [];
    } else {
      processedData = config.processData ? config.processData(data) : data;
    }

    console.log(
      `✨ [${apiName}] Successfully fetched ${processedData.length} items from API`
    );
    console.log(`💾 Storing data in cache for:`, baseDocRef);

    // Store in Firestore
    if (apiName === "stocks") {
      processedData = processedData.slice(0, 100);

      if (processedData.length === 0) {
        throw new Error("No stocks data received from API");
      }

      await db.collection("top100").doc(`${baseDocRef}-metadata`).set({
        timestamp: now,
        chunks: 1,
        totalItems: processedData.length,
      });

      await db.collection("top100").doc(`${baseDocRef}-chunk-0`).set({
        items: processedData,
      });
    } else {
      // For other categories, continue with chunking
      const CHUNK_SIZE = 100;
      const chunks = [];

      for (let i = 0; i < processedData.length; i += CHUNK_SIZE) {
        chunks.push(processedData.slice(i, i + CHUNK_SIZE));
      }

      const batch = db.batch();
      batch.set(metadataRef, {
        timestamp: now,
        chunks: chunks.length,
        totalItems: processedData.length || 0, // Ensure we always have a number
      });

      chunks.forEach((chunk, index) => {
        const chunkRef = db
          .collection("top100")
          .doc(`${baseDocRef}-chunk-${index}`);
        batch.set(chunkRef, { items: chunk });
      });

      await batch.commit();
    }

    return processedData;
  } catch (error) {
    console.error(`❌ Error fetching ${apiName}:`, error);
    return [];
  }
}

// Update the cleanup function to handle chunked data
// async function cleanupExpiredCache() {
//   try {
//     const snapshot = await db.collection("top100").get();
//     const now = Date.now();
//     const batch = db.batch();

//     for (const doc of snapshot.docs) {
//       const data = doc.data();
//       if (data.timestamp && now - data.timestamp >= CACHE_DURATION) {
//         // If it's a metadata document, also delete its chunks
//         if (doc.id.endsWith("-metadata")) {
//           const baseDocRef = doc.id.replace("-metadata", "");
//           for (let i = 0; i < data.chunks; i++) {
//             const chunkRef = db
//               .collection("top100")
//               .doc(`${baseDocRef}-chunk-${i}`);
//             batch.delete(chunkRef);
//           }
//         }
//         batch.delete(doc.ref);
//       }
//     }

//     await batch.commit();
//   } catch (error) {
//     console.error("Error cleaning up cache:", error);
//   }
// }

async function cleanupStocksChunks() {
  try {
    const snapshot = await db
      .collection("top100")
      .where(admin.firestore.FieldPath.documentId(), ">=", "stocks-chunk-")
      .where(admin.firestore.FieldPath.documentId(), "<", "stocks-chunk-\uf8ff")
      .get();

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      if (doc.id !== "stocks-chunk-0") {
        batch.delete(doc.ref);
      }
    });

    await batch.commit();
    console.log("Cleaned up extra stocks chunks");
  } catch (error) {
    console.error("Error cleaning up stocks chunks:", error);
  }
}

// Run this once
cleanupStocksChunks();

// API endpoints
app.get("/api/top100/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const { year } = req.query;

    if (!API_CONFIGS[category]) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const data = await fetchAndCacheData(category, { year });
    res.json(data);
  } catch (error) {
    console.error("Error in /api/top100/:category:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
