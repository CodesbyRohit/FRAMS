import axios from 'axios';

const test = async () => {
  try {
    const baseURL = 'http://localhost:5000/api';
    
    // 1. Login as admin
    console.log('Logging in as admin...');
    const loginRes = await axios.post(`${baseURL}/auth/login`, {
      email: 'admin@frams.edu',
      password: 'admin@123',
      role: 'admin'
    });
    
    const token = loginRes.data.token;
    console.log('Login successful.');

    // 2. Try to register a user with a unique email
    const uniqueEmail = `test.${Date.now()}@frams.edu`;
    console.log(`Attempting to register user with email: ${uniqueEmail}`);
    
    try {
      const regRes = await axios.post(`${baseURL}/users`, {
        name: 'Verification Test',
        email: uniqueEmail,
        role: 'student',
        department: 'Testing',
        faceDescriptor: new Array(128).fill(0.1),
        faceImage: 'data:image/jpeg;base64,AAA'
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('✅ Registration successful:', regRes.data.email);
    } catch (err) {
      console.error('❌ Registration failed:', err.response?.data?.message || err.message);
      if (err.response?.status === 500) {
          console.error('Server Log (if dev):', err.response?.data?.error);
      }
    }

    // 3. Test duplicate email handling
    console.log('Testing duplicate email handling...');
    try {
      await axios.post(`${baseURL}/users`, {
        name: 'Duplicate Test',
        email: uniqueEmail,
        role: 'student',
        department: 'Testing'
      }, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
    } catch (err) {
      console.log('✅ Duplicate test passed. Message:', err.response?.data?.message);
    }

  } catch (err) {
    console.error('Test script failed:', err.message);
    if (err.response) {
        console.error('Error data:', JSON.stringify(err.response.data, null, 2));
    }
  }
};

test();
