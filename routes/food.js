const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

// Common words to ignore when extracting food name
const ignoreWords = [
  "tell", "me", "about", "how", "many", "calories",
  "in", "a", "the", "is", "are", "what", "do", "you", "know", "of", "for"
];

// USDA API functions
async function searchFood(foodName) {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${foodName}&dataType=Foundation,Survey (FNDDS),SR Legacy&pageSize=10&api_key=${process.env.USDA_API_KEY}`;
    const response = await axios.get(url);
    const data = response.data;
    if (data.foods && data.foods.length > 0) {
      for (const food of data.foods) {
        if (food.description.toLowerCase().includes(foodName.toLowerCase())) {
          return food.fdcId;
        }
      }
      return data.foods[0].fdcId;
    }
    return null;
  } catch (error) {
    console.error(`Error searching food: ${error.message}`);
    return null;
  }
}

async function getFoodDetails(fdcId) {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${process.env.USDA_API_KEY}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching food details: ${error.message}`);
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
        nutritionInfo += `  - Note: Good source of ${nutrientName}.\n`;
        const pairing = foodPairings[nutrientName];
        if (pairing) {
          nutritionInfo += `  - Try combining with ${pairing}.\n`;
        }
      }

      const excessThreshold = excessThresholds[nutrientName];
      if (excessThreshold !== undefined && parseFloat(nutrient.amount) > excessThreshold) {
        nutritionInfo += `  - Warning: High amount of ${nutrientName}. May not be suitable in excess.\n`;
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
    nutritionInfo += "Note: This is approximate data per 100g. Serving size may vary.";
  }

  return nutritionInfo;
}

// Route
router.post('/info', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ msg: 'No query provided' });
  }

  try {
    const inputWords = query.toLowerCase().split(" ");
    const potentialFood = inputWords.filter(word => !ignoreWords.includes(word)).join(" ");
    const foodName = potentialFood.trim();

    if (!foodName) {
      return res.json({ response: "Sorry, I couldn't extract a food item from your query." });
    }

    const fdcId = await searchFood(foodName);
    if (!fdcId) {
      return res.json({ response: `Sorry, I couldn't find information for "${foodName}".` });
    }

    const foodData = await getFoodDetails(fdcId);
    const nutritionInfo = extractNutrition(foodData);
    return res.json({ response: nutritionInfo });
  } catch (err) {
    console.error("Error handling /info request:", err);
    return res.status(500).json({ response: "An error occurred while processing your request." });
  }
});

module.exports = router;
