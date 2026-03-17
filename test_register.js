const axios = require('axios');

const test = async () => {
  try {
    // 1. Login as admin
    console.log('Logging in as admin...');
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@frams.edu',
      password: 'admin@123',
      role: 'admin'
    });
    
    const token = loginRes.data.token;
    console.log('Login successful, token obtained.');

    // 2. Try to register a user
    console.log('Attempting to register a user...');
    try {
      const regRes = await axios.post('http://localhost:5000/api/users', {
        name: 'Test User',
        role: 'student',
        department: 'CS',
        faceDescriptor: new Array(128).fill(0),
        faceImage: 'data:image/jpeg;base64,AAA'
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('Registration successful:', regRes.data);
    } catch (err) {
      console.error('Registration failed with status:', err.response?.status);
      console.error('Error data:', JSON.stringify(err.response?.data, null, 2));
    }
  } catch (err) {
    console.error('Test script failed:', err.message);
    if (err.response) {
        console.error('Error data:', JSON.stringify(err.response.data, null, 2));
    }
  }
};

test();
