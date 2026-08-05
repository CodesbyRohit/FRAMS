'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export interface GalaxyNode {
  id: string;
  type: string;
  label: string;
  properties?: string;
}

export interface GalaxyEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const TYPE_RADIUS: Record<string, number> = {
  Person: 6.0,
  Skill: 4.4,
  Project: 4.9,
  Goal: 4.0,
  Memory: 3.4,
  Document: 3.7,
  Meeting: 2.8,
  Idea: 3.1,
  Organization: 5.5,
};

const TYPE_COLOR: Record<string, string> = {
  Person: '#a78bfa',
  Skill: '#22d3ee',
  Project: '#818cf8',
  Goal: '#34d399',
  Memory: '#94a3b8',
  Document: '#fbbf24',
  Meeting: '#2dd4bf',
  Idea: '#f472b6',
  Organization: '#f8fafc',
};

const FALLBACK_COLOR = '#8b5cf6';

interface SceneProps {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  onSelect: (node: GalaxyNode | null) => void;
}

function GalaxyScene({ nodes, edges, onSelect }: SceneProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const { camera, pointer } = useThree();
  const [hovered, setHovered] = useState<string | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const geometry = useMemo(() => {
    const positions = new Float32Array(nodes.length * 3);
    const colors = new Float32Array(nodes.length * 3);
    const n = Math.max(nodes.length, 1);
    nodes.forEach((node, i) => {
      // Fibonacci-sphere placement scaled by node type radius + jitter.
      const t = i / n;
      const y = 1 - t * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = GOLDEN_ANGLE * i;
      const jitter = 0.85 + (i % 5) * 0.07;
      const radius = (TYPE_RADIUS[node.type] ?? 3.5) * jitter;
      positions[i * 3] = Math.cos(theta) * r * radius;
      positions[i * 3 + 1] = y * radius;
      positions[i * 3 + 2] = Math.sin(theta) * r * radius;

      const color = new THREE.Color(TYPE_COLOR[node.type] ?? FALLBACK_COLOR);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [nodes]);

  const edgesGeometry = useMemo(() => {
    const indexById = new Map(nodes.map((n, i) => [n.id, i]));
    const positions: number[] = [];
    edges.forEach((edge) => {
      const a = indexById.get(edge.source);
      const b = indexById.get(edge.target);
      if (a === undefined || b === undefined) return;
      for (const idx of [a, b]) {
        positions.push(
          geometry.getAttribute('position').getX(idx),
          geometry.getAttribute('position').getY(idx),
          geometry.getAttribute('position').getZ(idx),
        );
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [edges, nodes, geometry]);

  // Slow ambient drift + hover picking (raycast against the point cloud).
  useFrame(() => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += 0.0008;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(pointsRef.current, false);
      const hit = hits[0];
      const hitId = hit && hit.index !== undefined ? nodes[hit.index].id : null;
      if (hitId !== hovered) {
        setHovered(hitId);
        onSelect(hitId ? nodeById.get(hitId) ?? null : null);
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <points ref={pointsRef} geometry={geometry} raycast={() => null}>
        <pointsMaterial
          size={0.32}
          vertexColors
          transparent
          opacity={0.95}
          sizeAttenuation
        />
      </points>
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial color="#3f3f68" transparent opacity={0.35} />
      </lineSegments>
      <Stars radius={70} depth={40} count={1800} factor={3} saturation={0} fade speed={0.6} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.6}
        minDistance={4}
        maxDistance={30}
      />
    </>
  );
}

export interface GalaxyCanvasProps {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  onSelect: (node: GalaxyNode | null) => void;
}

export function GalaxyCanvas({ nodes, edges, onSelect }: GalaxyCanvasProps) {
  return (
    <Canvas camera={{ position: [0, 0, 16], fov: 50 }} dpr={[1, 2]}>
      <GalaxyScene nodes={nodes} edges={edges} onSelect={onSelect} />
    </Canvas>
  );
}
