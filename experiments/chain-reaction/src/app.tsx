import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { motion } from "framer-motion-3d";
import { useCallback, useState } from "react";
import * as THREE from "three";
import { Game } from "./game";

const SIZE = 40;
const NO_OF_CELLS = 10;
const CELL_SIZE = SIZE / NO_OF_CELLS;
const ORB_SIZE = CELL_SIZE * 0.15;

function App() {
  return (
    <h1>
      {/* @ts-expect-error jsx is not possible. */}
      <style jsx>{`
        html,
        body {
          margin: 0;
        }
        #canvas {
          position: absolute;
          top: 0;
          left: 0;
        }
      `}</style>
      <div
        style={{
          width: "100vw",
          height: "100vh",
        }}
      >
        <Canvas
          flat
          linear
          camera={{
            position: [0, 0, SIZE],
          }}
        >
          <scene background={new THREE.Color("#fff5ee")} />
          <gridHelper
            args={[SIZE, NO_OF_CELLS, "#000", "#000"]}
            position={[0, 0, 0.01]}
            rotation-x={Math.PI / 2}
          />
          {/* <axesHelper args={[10]} /> */}
          <ambientLight intensity={1.0} />
          <directionalLight
            color="#fff"
            intensity={0.9}
            position={[0, 0, 10]}
          />
          <OrbitControls />

          <GamePlay />
        </Canvas>
      </div>
    </h1>
  );
}

const materials = {
  normal: new THREE.MeshStandardMaterial({
    color: "white",
  }),
  sphere: new THREE.MeshStandardMaterial({
    color: "yellow",
  }),
};

const GamePlay = () => {
  const [game] = useState(() => {
    return new Game({
      cells: { size: CELL_SIZE },
      rows: NO_OF_CELLS,
      columns: NO_OF_CELLS,
      players: 2,
      orbRadius: ORB_SIZE,
    });
  });
  const [, setUpdate] = useState(true);
  const update = useCallback(() => setUpdate((v) => !v), [setUpdate]);

  const CellUI = ({
    cell,
  }: {
    cell: ReturnType<typeof game.getCells>[number];
  }) => {
    const [, setHovered] = useState(false);
    return (
      <>
        <motion.mesh
          whileHover={{ scale: 0.95 }}
          key={cell.id}
          position={[cell.x - SIZE / 2, cell.y - SIZE / 2, 0]}
          rotation={[0, 0, 0]}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            cell.createOrb();

            if (game.areCellsAtCriticalMass()) {
              game.explodeCells();
            }

            update();
          }}
          material={materials.normal}
        >
          <boxGeometry attach="geometry" args={[CELL_SIZE, CELL_SIZE, 0.001]} />
        </motion.mesh>
        {cell.getOrbs().map((orb, i) => {
          return (
            <motion.mesh
              key={i}
              position={[orb.x - SIZE / 2, orb.y - SIZE / 2, 0]}
              rotation={[0, 0, 0]}
              material={materials.sphere}
            >
              <sphereGeometry attach="geometry" args={[ORB_SIZE, 32, 32]} />
            </motion.mesh>
          );
        })}
      </>
    );
  };

  return game.getCells().map((cell) => {
    return <CellUI cell={cell} key={cell.id} />;
  });
};

export default App;
