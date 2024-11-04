import express from 'express';
import bodyParser from 'body-parser';
import { Server } from 'socket.io';
import pkg from 'pg';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg; 

// Create a PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

pool.connect((err) => {
  if (err) throw err;
  console.log('Connected to PostgreSQL');
});

const app = express();
// const host =' 192.168.137.1';

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Google Maps API key from environment variable
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Home route to display the map
app.get('/', (req, res) => {
  res.render('index', { apiKey: GOOGLE_MAPS_API_KEY });
});

// Route to receive GPS data from the mobile device
app.post('/gps', async (req, res) => {
  const { device_id, latitude, longitude } = req.body;

  try {
    // Insert GPS data into the PostgreSQL database
    const query = `INSERT INTO locations (device_id, latitude, longitude) VALUES ($1, $2, $3)`;
    await pool.query(query, [device_id, latitude, longitude]);
    console.log('GPS data inserted');
    res.sendStatus(200);
  } catch (err) {
    console.error('Error inserting GPS data:', err);
    res.sendStatus(500);
  }
});

// GPS page route
app.get('/gps', (req, res) => {
  res.render('gps', { apiKey: GOOGLE_MAPS_API_KEY });
});

// IPinfo API key from environment variable
const YOUR_IPINFO_API_KEY = process.env.YOUR_IPINFO_API_KEY;

// POST ROUTE FOR RECEIVING IP ADDRESS
app.post('/ip-location', async (req, res) => {
  const { device_id } = req.body; // Assume IP will be used for location

  try {
    // Fetch location data from ipinfo
    const response = await axios.get(`https://ipinfo.io?token=${YOUR_IPINFO_API_KEY}`);
    const [latitude, longitude] = response.data.loc.split(','); // loc is usually in 'latitude,longitude' format

    const query = `INSERT INTO locations (device_id, latitude, longitude) VALUES ($1, $2, $3)`;
    await pool.query(query, [device_id, latitude, longitude]);

    console.log('IP-based location data inserted');
    res.sendStatus(200);
  } catch (err) {
    console.error('Error fetching or inserting IP-based location data:', err);
    res.sendStatus(500);
  }
});

// Start server and Socket.io for real-time updates
const server = app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});

const io = new Server(server);

// Real-time GPS location updates
// setInterval(async () => {
//   try {
//     // Fetch the latest location data from the database
//     const result = await pool.query('SELECT * FROM locations ORDER BY timestamp DESC LIMIT 1');
    
//     // Emit the most recent location to the clients
//     if (result.rows.length > 0) {
//       io.emit('locationUpdate', result.rows[0]);
//     }
//   } catch (err) {
//     console.error('Error fetching GPS data:', err);
//   }
// }, 3000);

io.on('connection', (socket) => {
  console.log('A client connected.');

  // Update all clients with the latest GPS data every time it changes
  socket.on('disconnect', () => {
    console.log('A client disconnected.');
  });
});

setInterval(async () => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY timestamp DESC LIMIT 1');
    if (result.rows.length > 0) {
      io.emit('locationUpdate', result.rows[0]);
    }
  } catch (err) {
    console.error('Error fetching GPS data:', err);
  }
}, 3000);

