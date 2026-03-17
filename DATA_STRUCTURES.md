# Data Structures in F.R.A.M.S

This document outlines the core data structures and architectural patterns utilized in the F.R.A.M.S (Face Recognition Attendance Management System) to manage biometric data and real-time analytics.

---

## 1. Arrays (Linear Data Structures)
Arrays are extensively used throughout the application for managing collections of data:
*   **User Registry**: The `frams_users` collection in LocalStorage is parsed as an array of objects for iteration and searching.
*   **Attendance Records**: All attendance entries are stored in a chronological array, allowing for trend analysis and CSV exporting.
*   **Recent Feed**: A derived array (using `.slice(-6).reverse()`) is used to populate the "Live Activity Feed" on the dashboard.
*   **Model Shards**: The `face-api.js` models utilize arrays to manage sharded weight files during the loading sequence.

## 2. Objects (Key-Value Pairs)
Objects serve as the primary structure for complex data entities:
*   **User Profile Object**:
    ```javascript
    {
      id: "uuid",
      name: "String",
      role: "Student/Faculty/Admin",
      descriptor: [Float32Array converted to Array],
      snapshot: "Base64 String",
      registeredAt: "ISO Date"
    }
    ```
*   **Attendance Record Object**:
    ```javascript
    {
      userId: "uuid",
      name: "String",
      role: "String",
      date: "YYYY-MM-DD",
      time: "HH:MM:SS"
    }
    ```

## 3. Sets (Unique Collections)
*   **Cooldown Registry**: Utilized in `Scanner.jsx` (`unknownCooldowns`) to track unique face positions in a frame. A `Set` is used for $O(1)$ lookup time to prevent spamming security alerts for the same unknown face within a short timeframe.

## 4. Typed Arrays (`Float32Array`)
*   **Face Descriptors**: The `face-api.js` library generates descriptors as 128-dimensional `Float32Array` vectors. These are used for high-speed mathematical comparison (Euclidean Distance) during the recognition phase.
*   **LabeledDescriptors**: These are mapped objects that link `Float32Array` data to specific User IDs for the `FaceMatcher` algorithm.

## 5. Persistent Storage (LocalStorage Map)
*   **LocalStorage**: Acts as our primary persistent data store, functioning like a simplified NoSQL database where keys map to stringified JSON records.

## 6. Stacks (LIFO - Last In, First Out)
*   **Canvas State Stack**: In `Scanner.jsx`, the `ctx.save()` and `ctx.restore()` methods are used during the rendering of AI reticles. This utilizes the browser's internal Stack to preserve and revert coordinate transformations and styles.
*   **Execution Stack**: The JavaScript engine manages the component lifecycle and asynchronous AI detection calls using a call stack.

## 7. Queues (FIFO - First In, First Out)
*   **Activity Feed Logic**: The "Recent Face Scans" panel functionally acts as a **Fixed-Size Queue**. As new attendance records are pushed into the storage, the oldest records are shifted out of the primary view, maintaining a real-time sliding window of activity.
*   **Asynchronous Task Queue**: React and the browser use a task queue to manage events, such as webcam stream updates and the 600ms AI detection interval, ensuring the UI remains responsive.

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
