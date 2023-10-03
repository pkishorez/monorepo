export function Box({ position = [0, 0, 0], name = "A" }) {
  return (
    <mesh position={position} name={name}>
      <boxGeometry />
      <meshBasicMaterial color={65280} wireframe />
    </mesh>
  );
}
