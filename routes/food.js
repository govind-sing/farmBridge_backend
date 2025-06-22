const express = require('express');
const router = express.Router();
const AIML = require('aiml-high');
const axios = require('axios');
require('dotenv').config();

// Initialize AIML interpreter
const aiml = new AIML();
aiml.loadFiles(['./food.aiml']);

// Common words to ignore
const ignoreWords = [
  "tell", "me", "about", "how", "many", "calories",
  "in", "a", "the", "is", "are", "what", "do", "you", "know"
];

// USDA API functions
async function searchFood(foodName) {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${foodName}&dataType=Foundation,Survey (FNDDS),SR Legacy&pageSize=10&api_key=${process.env.USDA_API_KEY}`;
    // console.log(`Search URL: ${url}`);
    const response = await axios.get(url);
    const data = response.data;
    // console.log(`Search Response for ${foodName}:`, JSON.stringify(data, null, 2));
    if (data.foods && data.foods.length > 0) {
      for (const food of data.foods) {
        if (food.description.toLowerCase().includes(foodName.toLowerCase())) {
          // console.log(`Found fdcId: ${food.fdcId}, Description: ${food.description}`);
          return food.fdcId;
        }
      }
      // console.log(`Fallback fdcId: ${data.foods[0].fdcId}, Description: ${data.foods[0].description}`);
      return data.foods[0].fdcId;
    }
    // console.log(`No foods found for ${foodName}`);
    return null;
  } catch (error) {
    console.error(`Error searching food: ${error.message}`);
    if (error.response) {
      console.error(`Search Error Response:`, JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function getFoodDetails(fdcId) {
  try {
    // Try /food/ endpoint (singular, as in your Python code)
    const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${process.env.USDA_API_KEY}`;
    // console.log(`Fetching details from URL: ${url}`);
    const response = await axios.get(url);
    // console.log(`Details Response for fdcId ${fdcId}:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(`Error fetching food details from /food/: ${error.message}`);
    if (error.response) {
      console.error(`Details Error Response from /food/:`, JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

function extractNutrition(foodData) {
  if (!foodData) return "No data found.";

  const description = foodData.description || "Unknown food";
  const nutrients = foodData.foodNutrients || [];

  const nutrientValues = {};
  nutrients.forEach(nutrient => {
    const name = nutrient.nutrient.name;
    const amount = nutrient.amount || null;
    const unit = nutrient.nutrient.unitName || "";
    nutrientValues[name] = {
      amount,
      unit,
      formatted: amount !== null ? `${amount} ${unit}` : "N/A"
    };
  });

  const importantNutrients = {
    "Energy": "Provides energy for daily activities and bodily functions.",
    "Protein": "Essential for muscle repair, growth, and immune system support.",
    "Total lipid (fat)": "A source of energy and helps absorb fat-soluble vitamins (A, D, E, K).",
    "Carbohydrate, by difference": "The body’s primary energy source, especially for the brain.",
    "Fiber, total dietary": "Supports digestion, gut health, and helps regulate blood sugar.",
    "Vitamin C, total ascorbic acid": "Boosts immunity, acts as an antioxidant, and supports skin health.",
    "Vitamin A, RAE": "Important for vision, skin health, and immune function.",
    "Calcium, Ca": "Crucial for strong bones, teeth, and muscle function.",
    "Iron, Fe": "Necessary for oxygen transport in the blood and preventing anemia.",
    "Potassium, K": "Helps regulate blood pressure, muscle contractions, and nerve signals."
  };

  const goodSourceThresholds = {
    "Protein": 10,
    "Fiber, total dietary": 5,
    "Vitamin C, total ascorbic acid": 15,
    "Vitamin A, RAE": 50,
    "Calcium, Ca": 250,
    "Iron, Fe": 3.5,
    "Potassium, K": 940
  };

  const foodPairings = {
    "Iron, Fe": "foods rich in vitamin C (like oranges or strawberries) to enhance absorption",
    "Vitamin A, RAE": "a small amount of healthy fats (like olive oil) to boost absorption",
    "Calcium, Ca": "magnesium-rich foods (like leafy greens) for improved bone health",
    "Vitamin C, total ascorbic acid": "a meal with fresh fruits to maximize antioxidant benefits",
    "Protein": "carbohydrate-rich foods (like whole grains) to create a balanced meal",
    "Fiber, total dietary": "probiotic foods (like yogurt) for optimal gut health"
  };

  const excessThresholds = {
    "Total lipid (fat)": 20
  };

  let nutritionInfo = `Food: ${description} (per 100g)\n\n`;
  for (const [nutrientName, importance] of Object.entries(importantNutrients)) {
    const nutrient = nutrientValues[nutrientName];
    if (nutrient && nutrient.amount !== null) {
      const value = nutrient.formatted;
      nutritionInfo += `${nutrientName}: ${value}\n`;
      nutritionInfo += `  - Importance: ${importance}\n`;

      const threshold = goodSourceThresholds[nutrientName];
      if (threshold !== undefined && parseFloat(nutrient.amount) >= threshold) {
        nutritionInfo += `  - Note: This food is a good source of ${nutrientName} and may help if you're deficient in it.\n`;
        const pairing = foodPairings[nutrientName];
        if (pairing) {
          nutritionInfo += `  - For best results, consider combining it with ${pairing}.\n`;
        }
      }

      const excessThreshold = excessThresholds[nutrientName];
      if (excessThreshold !== undefined && parseFloat(nutrient.amount) > excessThreshold) {
        nutritionInfo += `  - Warning: The amount of ${nutrientName} is high. Excessive consumption may not be recommended.\n`;
      }

      nutritionInfo += "\n";
    }
  }

  const waterNutrient = nutrientValues["Water"];
  if (waterNutrient && waterNutrient.amount !== null) {
    const waterContent = waterNutrient.formatted;
    nutritionInfo += `Water Content: ${waterContent}\n`;
    nutritionInfo += "  - Importance: High water content helps in hydration, digestion, and temperature regulation.\n\n";
  }

  if (nutritionInfo === `Food: ${description} (per 100g)\n\n`) {
    nutritionInfo = `Food: ${description}\nNo significant nutritional data available.`;
  } else {
    nutritionInfo += "Note: Serving sizes vary; this information is per 100g. Consult a nutritionist for personalized recommendations.";
  }

  return nutritionInfo;
}

// Food Info Route
router.post('/info', (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ msg: 'No query provided' });
  }

  aiml.findAnswer(query, async (answer, wildCardArray) => {
    if (!answer) {
      return res.json({ response: "I’m not sure how to respond to that." });
    }

    let foodName = null;
    let isSpecificQuery = false;

    if (answer.includes("let me get the information")) {
      isSpecificQuery = true;
      foodName = wildCardArray[0];
    } else {
      const inputWords = query.toLowerCase().split(" ");
      const potentialFood = inputWords.filter(word => !ignoreWords.includes(word)).join(" ");
      foodName = potentialFood.trim() || null;
    }

    if (foodName) {
      const fdcId = await searchFood(foodName);
      if (fdcId) {
        const foodData = await getFoodDetails(fdcId);
        const nutritionInfo = extractNutrition(foodData);
        if (isSpecificQuery) {
          return res.json({ response: `${answer}\n${nutritionInfo}` });
        } else {
          return res.json({ response: `Here's what I found for ${foodName}:\n${nutritionInfo}` });
        }
      } else {
        if (isSpecificQuery) {
          return res.json({ response: `${answer}\nSorry, I couldn't find information for that food.` });
        } else {
          return res.json({ response: "I couldn't find information about that." });
        }
      }
    } else {
      return res.json({ response: answer });
    }
  });
});

module.exports = router;