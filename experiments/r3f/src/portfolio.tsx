import { Environment, useGLTF } from "@react-three/drei";

export function Portfolio() {
  const { scene } = useGLTF("/laptop.glb");
  return (
    <>
      <color args={["#241a1a"]} attach="background" />
      <Environment preset="city" />

      <primitive object={scene} />
    </>
  );
}
