const express = require('express');
const multer = require('multer');

const app = express();
const port = 3000;

const uploads = multer({ dest: 'uploads/' });

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/upload', uploads.single('pdf'), (req, res) => {
  console.log(req.file);
  res.send('File uploaded successfully');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});