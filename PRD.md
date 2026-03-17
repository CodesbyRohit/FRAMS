Product Requirements Document
Project Name: F.R.A.M.S

Face Recognition Attendance Management System

1. Overview

F.R.A.M.S (Face Recognition Attendance Management System) is a web-based biometric attendance platform that uses AI-powered face recognition to automate attendance tracking for educational institutions.

The system replaces manual attendance processes with a real-time facial recognition scanner, allowing students to mark attendance simply by appearing in front of a webcam.

The project demonstrates the integration of:

Artificial Intelligence

Computer Vision

Web Technologies

Data Analytics

The goal is to create a modern SaaS-style attendance management platform that is efficient, secure, and easy to use.

2. Problem Statement

Traditional attendance systems suffer from several issues:

Manual attendance is time-consuming.

Proxy attendance is common.

Biometric devices are expensive.

Data analysis is limited.

Attendance records are difficult to manage.

Educational institutions require a low-cost, automated, and intelligent solution that improves accuracy while providing real-time insights.

3. Objectives

The main objectives of this project are:

Automate attendance using facial recognition.

Prevent proxy attendance.

Provide a modern dashboard for attendance analytics.

Implement role-based access for administrators, faculty, and students.

Store attendance data securely in a database.

Demonstrate practical applications of AI in everyday systems.

4. Target Users

The system is designed for three primary user groups.

Admin

Responsibilities:

Manage users

Register new faces

Monitor attendance

View analytics dashboard

Export records

Faculty

Responsibilities:

Operate the attendance scanner

Monitor class attendance

View attendance records

Students

Responsibilities:

Mark attendance via facial recognition

View personal attendance history

Track attendance percentage

5. Key Features
5.1 AI Face Recognition Scanner

The scanner captures live video from the webcam and performs:

Face detection

Face recognition

Identity verification

Confidence score calculation

Real-time attendance marking

Security features include:

Unknown face detection

Live biometric scan animations

Identity verification panel

5.2 Role-Based Login System

Users log in using secure authentication with three roles:

Role	Access Level
Admin	Full system control
Faculty	Scanner + records
Student	Personal attendance

Authentication uses encrypted passwords and session tokens.

5.3 Attendance Dashboard

The system provides a modern analytics dashboard including:

Total attendance count

Recognized vs unknown users

Attendance trends

Recent scan activity

Performance charts

These analytics help administrators monitor attendance patterns.

5.4 Student Dashboard

Students have access to a personal dashboard that shows:

Attendance percentage

Last scan time

Attendance history

Attendance trend graph

This helps students track their academic participation.

5.5 Attendance Records System

The platform maintains a complete database of attendance events.

Each record includes:

Student identity

Date

Time

Confidence score

Attendance status

Records can be filtered and searched by administrators.

6. System Architecture

The system follows a full-stack architecture.

Frontend

React

Interactive dashboards

Real-time webcam scanning

Backend

Node.js server

REST API

Authentication system

Database

MongoDB for storing:

Users

Face descriptors

Attendance records

7. Technology Stack
Layer	Technology
Frontend	React
Backend	Node.js, Express
Database	MongoDB
AI Vision	face-api.js
Charts	Recharts
Authentication	JWT
Camera API	WebRTC
8. Functional Requirements

The system must:

Allow users to register with facial data.

Detect and recognize faces through the webcam.

Mark attendance automatically.

Store attendance records in the database.

Provide role-based dashboards.

Display real-time analytics.

9. Non-Functional Requirements
Performance

Face recognition must operate in real time.

Security

Passwords must be hashed.

API routes must be protected.

Scalability

The database should support large numbers of users.

Usability

Interface should be intuitive and modern.

10. Limitations

Current limitations include:

Face recognition accuracy depends on lighting conditions.

System requires a webcam-enabled device.

Performance depends on device hardware.

11. Future Improvements

Future versions may include:

Mobile application support

Multi-camera scanning systems

Cloud-based deployment

Face recognition login

Automated attendance reports

12. Success Criteria

The project will be considered successful if:

Face recognition correctly identifies registered users.

Attendance is recorded automatically.

The dashboard accurately reflects attendance statistics.

The system provides a smooth and secure user experience.

13. Conclusion

F.R.A.M.S demonstrates the practical use of AI and computer vision technologies in solving real-world problems such as attendance management.

By integrating facial recognition with a full-stack web platform, the system provides an efficient, scalable, and modern alternative to traditional attendance methods.

This project highlights how emerging technologies can enhance everyday administrative systems in educational environments.