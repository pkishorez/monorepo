import { OrbitControls, Stats } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useControls } from "leva";
import { Box } from "./box";

function App() {
  const color = useControls({
    value: "green",
  });
  return (
    <Canvas camera={{ position: [0, 0, 2] }}>
      <Box position={[0.75, 0, 0]} />
      <Box position={[-0.75, 0, 0]} />
      <Stats />
      <OrbitControls />
      <axesHelper args={[5]} />
      <gridHelper />
    </Canvas>
  );
}

export default App;
