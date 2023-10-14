import { OrbitControls, Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

function App() {
  return (
    <Canvas camera={{ position: [0, 0, 2] }}>
      <Stats />
      <OrbitControls />
      <axesHelper args={[5]} />
      <gridHelper />
    </Canvas>
  );
}

export default App;
