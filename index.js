import express from 'express';
import bodyParser from 'body-parser';
import { Server } from 'socket.io';
import pkg from 'pg';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const { Pool } = pkg; 
// const LOCAL_IP = '192.168.137.70';

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
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({ origin: 'http://localhost:3001' }));

// app.use(cors({ origin: `http://${LOCAL_IP}:3001` }));

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

//POST ROUTE FOR RECEIVING GPS DATA FROM OTHER DEVICES
app.post('/receive-gps-data', (req, res) => {
  const { latitude, longitude, device_id } = req.body;
  
  if (latitude && longitude && device_id) {
    // Process GPS data or save it to the database
    console.log('Received GPS data:', { latitude, longitude, device_id });
    res.status(200).json({ message: 'GPS data received successfully' });
  } else {
    res.status(400).json({ message: 'Invalid data received' });
  }
});


// Route to fetch recent location data (for the map)
app.get('/api/locations', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM locations ORDER BY timestamp DESC LIMIT 10');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching location data:', err);
    res.sendStatus(500);
  }
});

// IPinfo API key from environment variable
const YOUR_IPINFO_API_KEY = process.env.YOUR_IPINFO_API_KEY;

// POST ROUTE FOR RECEIVING IP ADDRESS
app.post('/ip-location', async (req, res) => {
  const { device_id } = req.body;

  try {
    const response = await axios.get(`https://ipinfo.io?token=${YOUR_IPINFO_API_KEY}`);
    const [latitude, longitude] = response.data.loc.split(',');

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
io.on('connection', (socket) => {
  console.log('A client connected.');

  // Periodically fetch and emit the latest location data to connected clients
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

  socket.on('disconnect', () => {
    console.log('A client disconnected.');
  });
});
