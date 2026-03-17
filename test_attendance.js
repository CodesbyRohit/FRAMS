import axios from 'axios';

const testAttendance = async () => {
  const url = 'http://localhost:5000/api/attendance/mark';
  const payload = {
    userId: '69b79334b77409764bc330c9',
    name: 'Gangotri Nagesh Vaidikar',
    role: 'student',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString(),
    confidenceScore: 51,
    status: 'present'
  };

  try {
    console.log('Sending payload:', JSON.stringify(payload, null, 2));
    const response = await axios.post(url, payload);
    console.log('Success:', response.status, response.data);
  } catch (error) {
    if (error.response) {
      console.log('Error:', error.response.status, error.response.data);
    } else {
      console.log('Connection Error:', error.message);
    }
  }
};

testAttendance();
