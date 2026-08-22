const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('index', { title: 'Snapain' });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Halaman Tidak Ditemukan' });
});

// only listen on a port when run directly (`node server.js`) — Vercel imports
// `app` itself and calls it as a request handler, it never runs this file
// as the entry point.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Snapain jalan di http://localhost:${PORT}`);
  });
}

module.exports = app;
