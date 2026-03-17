# F.R.A.M.S — Face Recognition Attendance Management System
### *Built by First Year F-3 Batch*

F.R.A.M.S is a premium, frontend-only biometric security and attendance management platform. It leverages advanced facial recognition technology to automate the process of student and faculty attendance, providing a professional SaaS-style dashboard for real-time analytics.

---

## 🚀 Key Features

### 🖥️ SaaS Dashboard
*   **KPI Stat Cards**: Real-time counters for registered users, presence today, and total scans.
*   **Attendance Trend**: Interactive Area Chart showing 7-day attendance patterns.
*   **Identity Distribution**: Donut chart visualizing the ratio of Students, Faculty, and Admin.
*   **Live Activity Feed**: Animated feed showing the most recent face scans and identity verifications.
*   **System Maintenance**: One-click tools to clear attendance records or reset the user database.

### 🔒 AI Biometric Scanner
*   **Real-time Recognition**: Powered by `face-api.js` for high-precision face matching.
*   **Futuristic HUD**: Animated canvas overlays, lock-on reticles, and confidence bars.
*   **Profile Flash Card**: Sequential verification animation for successful attendance marking.
*   **Identity Guard**: Automatic alerts and red-themed UI for unknown target detection.
*   **Optimized Performance**: 60fps canvas rendering with throttled AI detection to balance accuracy and CPU usage.

### 📋 Registry & Records
*   **User Registration**: Webcam-based face capture with descriptor generation.
*   **Attendance Logs**: Digital record keeping with search and filtering capabilities.
*   **CSV Export**: One-click data export powered by `PapaParse`.

---

## 🛠️ Technology Stack
*   **Core**: React + Vite
*   **Face Recognition**: face-api.js (SSD MobileNet V1, Face Landmarks, Face Recognition)
*   **Analytics**: Recharts
*   **Data Handling**: PapaParse
*   **Icons**: Lucide React
*   **Persistence**: LocalStorage (Simulated Database)

---

## 📦 Installation & Setup

1. **Clone the repository**
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Download AI Models**:
   ```bash
   node scripts/download-models.cjs
   ```
4. **Run the development server**:
   ```bash
   npm run dev
   ```

---

## 🛡️ Access Credentials
*   **Admin Username**: `admin`
*   **Admin Password**: `admin`

---

Built with ❤️ for the First Year Physics Mini Project.
