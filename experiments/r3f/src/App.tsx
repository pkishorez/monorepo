import { OrbitControls } from "@react-three/drei";
import { Perf } from "r3f-perf";
import { Canvas } from "@react-three/fiber";
import { Portfolio } from "./portfolio";
import { useControls } from "leva";

function App() {
  const { x, y, z } = useControls("Camera", { x: 1, y: 1, z: 1 });

  console.log({ x, y, z });

  return (
    <Canvas
      camera={{
        fov: 45,
        near: 0.1,
        far: 2000,
        position: [x, y, z],
      }}
      style={{ background: "white" }}
    >
      <Perf position="top-left" />
      <Portfolio />
    </Canvas>
  );
}

export default App;
