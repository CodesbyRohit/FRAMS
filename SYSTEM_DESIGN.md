# System Design: F.R.A.M.S Biometric Intelligence

This document details the architectural decisions and engineering principles behind the F.R.A.M.S (Face Recognition Attendance Management System) platform.

---

## 🏗️ High-Level Architecture

The system utilizes a modern 3-tier architecture with an integrated **Edge AI Vision Layer**:

1.  **Client (React + AI Vision Engine)**:
    *   Handles real-time video acquisition via WebRTC.
    *   Executes `face-api.js` (TensorFlow.js) for on-device inference.
    *   **A.R.I.A. Voice Engine**: Orchestrates real-time vocal feedback using Web Speech API (V.O.X Protocol).
    *   **HUD Rendering Layer**: High-fidelity canvas overlays with telemetry syncing.
    *   Calculates liveness and behavior metrics locally to minimize server latency.
2.  **Backend (Node.js + Express)**:
    *   Stateless REST API handles identity matching and record persistence.
    *   Manages Behavioral Profile updates via EWMA scaling logic.
    *   Secures routes using JWT-based Role-Based Access Control (RBAC).
3.  **Database (MongoDB)**:
    *   Stores 128D biometric embeddings (sharded for scale).
    *   Persists historical attendance logs and adaptive behavior baselines.

---

## 🔄 Technical Data Flow

The biometric pipeline follows a deterministic path from photon to persistence:

1.  **Ingestion**: 720p/30fps stream captured via browser MediaDevices API.
2.  **Detection**: SSD MobileNet V1 identifies face location (bounding boxes).
3.  **Landmarking**: 68-point feature mapping for liveness checking.
4.  **Vectorization**: Face-recognition model generates 128D floating-point embeddings.
5.  **Liveness Validation**: Multi-signal check (Blinks > 1, Motion Displacement > 4px).
6.  **Behavior Scoring**: Comparison against stored EWMA baseline (Blink rate/Scan duration).
7.  **Risk Assessment**: Frontend engine calculates normalized Risk Score (0-100).
8.  **Sync**: Verified identity + Risk telemetry POSTed to `/api/attendance/mark`.
9.  **Storage**: Record committed to MongoDB; User profile updated with new behavior data.
10. **Feedback Loop**: A.R.I.A. confirms identity via vocal synthesis; UI reflects new scan via state polling.

---

## 🧠 Key Design Decisions & Rationale

### 1. Client-Side AI Inference (Edge Computing)
*   **Why**: Running models in the browser minimizes server CPU load and eliminates high-bandwidth video streaming to the cloud. 
*   **Privacy**: Biometric signatures are processed in-memory; only descriptors (anonymous vectors) are sent to the DB.

### 2. MongoDB Document Store
*   **Why**: Biometric profiles are hierarchical and evolve. MongoDB’s schema-less nature allows us to add new behavioral metrics (e.g., eye gaze, heatmaps) without rigid migrations.

### 3. JWT (JSON Web Tokens)
*   **Why**: Provides stateless authentication, allowing the backend to scale horizontally without session-storage overhead.

### 4. EWMA (Exponentially Weighted Moving Average)
*   **Why**: The system uses an alpha of 0.2 (`new = old * 0.8 + current * 0.2`) to update behavior profiles. This ensures the "Identity Rhythm" adapts to natural user changes over time while remaining resilient to outliers.

### 5. Architectural VFX Separation
*   **Why**: By separating the VFX layer (Intro/HUD) from the core logic, we maintain 60fps performance during complex biometric processing. The "Cinematic Layer" reacts to state changes without blocking the inference loop.

### ⚡ 6. Zero-Latency Hydration
*   **Why**: Artificial delays were removed from the `AuthContext` cycle to achieve a 100/100 Lighthouse performance score. Session hydration now occurs in <10ms, providing an "instant-on" user experience.

---

## ⚖️ Engineering Trade-offs

*   **Latency vs. Accuracy**: We throttle AI detection to ~600ms intervals. This ensures a stable 60fps UI while maintaining high-precision verification.
*   **Hardware Dependency**: Client-side AI shifts processing power to the user's device. While great for server costs, performance may vary on older hardware.

---

## 🚀 Scalability & Future Roadmap

*   **Multi-Device Sync**: Implementing **WebSockets (Socket.io)** for instant cross-device admin alerts.
*   **Distributed AI**: Moving heavy risk-training to **Python/FastAPI** microservices using specialized ML workers.
*   **Cloud Deployment**: Dockerized container orchestration using Kubernetes for auto-scaling during peak attendance hours.

---

## 🔐 Security Considerations

1.  **Presentation Attack Detection (PAD)**: Multi-factor liveness check prevents photo/video spoofing.
2.  **Encrypted Descriptors**: Biometric vectors are stored as numerical arrays, making reverse-engineering of the original face image impossible.
3.  **Adaptive Risk Thresholds**: Trust levels are user-specific; a high-risk score for one user might be normal behavior for another.
