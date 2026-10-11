This document outlines the core data structures and architectural patterns utilized in the F.R.A.M.S (Face Recognition Attendance Management System). 

> [!NOTE]
> All data is now persisted in **MongoDB**, replacing the earlier LocalStorage-based prototype for high-availability and security.

---

## 🔄 System Flow

1. **Camera Acquisition**: Captures live video feed via WebRTC.
2. **Face Detection**: SSD MobileNet V1 identifies face bounding boxes.
3. **Face Landmarks**: 68-point feature mapping for liveness checking.
4. **Encoding**: Generation of a 128D descriptor vector.
5. **Liveness Verification**:
   - **Blink Detection**: EAR (Eye Aspect Ratio) calculation.
   - **Spatial Motion**: Nose tip displacement tracking.
   - **Stability**: Frame-to-frame stabilization check.
6. **Behavioral Analysis**: Comparison against user-specific biometric rhythms.
7. **Risk Engine**: Evaluation of all signals to calculate a Risk Score (0-100).
8. **Decision Logic**:
   - **High Trust**: Verification successful → Attendance marked.
   - **Anomalous**: Identity rejected → Blocking + Security Alert.
9. **Persistence**: Syncing verified record to MongoDB via REST API.
10. **Telemetry**: Real-time update of Dashboard charts and live feed.

---

## 1. Arrays (Linear Data Structures)
Arrays are extensively used throughout the application for managing collections of data:
*   **User Registry**: The `users` collection in MongoDB is indexed by `username` and `role` for $O(1)$ lookup during authentication.
*   **Attendance Records**: All attendance entries are stored in the `attendances` collection, allowing for real-time trend analysis and professional CSV exporting.
*   **Recent Feed**: A derived query (using `.limit(6).sort({createdAt: -1})`) is used to populate the "Live Activity Feed" on the dashboard.
*   **Model Shards**: The `face-api.js` models utilize arrays to manage sharded weight files during the loading sequence.

## 2. Objects (Key-Value Pairs)
Objects serve as the primary structure for complex data entities:
    ```javascript
    {
      _id: "ObjectId", // User identifier
      username: "String",
      role: "student / faculty / admin",
      faceDescriptor: [Array(128)], // Biometric signature
      faceImage: "Base64 String", // Enrolled snapshot
      behaviorProfile: {
        blinkRate: Number,
        movementPattern: Number,
        avgScanTime: Number,
        adaptiveThreshold: Number // Learned trust limit
      },
      riskProfile: {
        lastRiskScore: Number,
        anomalyCount: Number
      },
      createdAt: "ISODate"
    }
    ```
    ```javascript
    {
      userId: "ObjectId",
      name: "String",
      status: "present / absent",
      date: "YYYY-MM-DD",
      time: "HH:MM:SS",
      confidenceScore: Number,
      riskLevel: "LOW / MEDIUM / HIGH",
      riskScore: Number,
      scanTime: Number // Duration of liveness check
    }
    ```

*   **Cooldown Registry**: Utilized in `Scanner.jsx` (`unknownCooldowns`) to track unique face positions in a frame.
*   **Spoken Protocol Registry**: Utilized in `Scanner.jsx` (`spokenRef`) to track unique vocal protocols (e.g., 'face_detected') to prevent assistant repetition. A `Set` provides $O(1)$ deduplication.

## 4. Typed Arrays (`Float32Array`)
*   **Face Descriptors**: The `face-api.js` library generates descriptors as 128-dimensional `Float32Array` vectors. These are used for high-speed mathematical comparison (Euclidean Distance) during the recognition phase.
*   **LabeledDescriptors**: These are mapped objects that link `Float32Array` data to specific User IDs for the `FaceMatcher` algorithm.

## 5. Persistent Storage (MongoDB Cluster)
*   **MongoDB**: Acts as our primary persistent data store, providing ACID compliance and sharded biometric indexing for high-load attendance events.

## 6. Stacks (LIFO - Last In, First Out)
*   **Canvas State Stack**: In `Scanner.jsx`, the `ctx.save()` and `ctx.restore()` methods are used during the rendering of AI reticles. This utilizes the browser's internal Stack to preserve and revert coordinate transformations and styles.
*   **Execution Stack**: The JavaScript engine manages the component lifecycle and asynchronous AI detection calls using a call stack.

## 7. Queues (FIFO - First In, First Out)
*   **Activity Feed Logic**: The "Recent Face Scans" panel functionally acts as a **Fixed-Size Queue**. As new attendance records are pushed into the storage, the oldest records are shifted out of the primary view, maintaining a real-time sliding window of activity.
*   **Asynchronous Task Queue**: React and the browser use a task queue to manage events, such as webcam stream updates and the 600ms AI detection interval.
*   **A.R.I.A. Voice Queue**: The `SpeechSynthesis` engine manages a FIFO queue of vocal utterances, ensuring system feedback is delivered sequentially without overlap.

## 8. Trees (Hierarchical Data)
*   **DOM Tree**: The entire SaaS interface is structured as a Document Object Model (DOM) tree.
*   **React Component Tree**: The application architecture follows a tree structure (App → Sidebar/Header/Page Content → Components).
*   **JSON Serialization**: The nested user and attendance data stored in LocalStorage represents a hierarchical tree structure of information.

## 9. Graphs (Network Structures)
*   **Routing Graph**: The `react-router-dom` navigation in `App.jsx` defines a graph of potential application states (nodes) and the links (edges) that connect them.
*   **Module Dependency Graph**: The project structure itself is a directed graph where files (like `Scanner.jsx`) depend on services (`faceService.js`) and utilities (`storage.js`).

---

## 10. Algorithmic Patterns
*   **Linear Interpolation (LERP)**: Used in the Scanner canvas rendering to smooth the movement of bounding boxes between detection frames.
*   **Euclidean Distance Mapping**: Used by the Biometric Engine to calculate the similarity score (0.0 to 1.0) between a detected face and a registered profile.
*   **Throttling/Debouncing**: Implemented in the detection loop to manage CPU load and ensure a stable 60fps UI experience.

---

## 🌍 Real-World Use Cases & Impact
- **Security Access Control**: Managing high-security zones with behavior-aware verification.
- **Smart Campus Management**: Automated attendance tracking with real-time analytics.
- **Identity Fraud Protection**: Preventing biometric presentation attacks through liveness detection.
- **Operational Intelligence**: Utilizing movement and presence patterns for facility optimization.
