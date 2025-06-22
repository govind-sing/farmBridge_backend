const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Ensure uploads folder exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Plant Identification (PlantNet API)
router.post('/identify', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No image uploaded' });
    }
    const imagePath = req.file.path;
    const apiKey = process.env.PLANTNET_API_KEY;
    const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}`;
    const organ = req.body.organ || 'leaf'; // Use provided organ or default to 'leaf'

    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('images', fs.createReadStream(imagePath));
    formData.append('organs', organ);

    const response = await axios({
      method: 'post',
      url,
      data: formData,
      headers: {
        ...formData.getHeaders(),
      },
    });

    const plantName = response.data.results?.[0]?.species?.scientificNameWithoutAuthor || 'Unknown plant';
    res.json({ plantName });

    fs.unlink(imagePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
  } catch (err) {
    console.error('PlantNet Error:', err.response?.data || err.message);
    res.status(500).json({ msg: 'Error identifying plant' });
  }
});

// Disease Detection (Plant.id API)
router.post('/disease', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No image uploaded' });
    }
    const imagePath = req.file.path;
    const apiKey = process.env.PLANTID_API_KEY;
    const url = 'https://api.plant.id/v2/health_assessment';

    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('images', fs.createReadStream(imagePath));
    formData.append('organs', 'leaf'); // Fixed to leaf for simplicity; can be made dynamic if needed

    const response = await axios({
      method: 'post',
      url,
      data: formData,
      headers: {
        'Api-Key': apiKey,
        ...formData.getHeaders(),
      },
    });

    const disease = response.data.health_assessment?.diseases?.[0]?.name || 'No disease detected';
    res.json({ disease });

    fs.unlink(imagePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });
  } catch (err) {
    console.error('Plant.id Error:', err.response?.data || err.message);
    res.status(500).json({ msg: 'Error detecting disease' });
  }
});

module.exports = router;