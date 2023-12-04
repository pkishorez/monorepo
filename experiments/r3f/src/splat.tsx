import { useGLTF } from "@react-three/drei";

export function Model() {
  const loader = useGLTF("/newyork1k.glb");
  if (!loader) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { nodes, materials } = loader as any;

  return (
    <group dispose={null}>
      <group name="Sketchfab_Scene">
        <group
          name="Sketchfab_model"
          rotation={[-Math.PI / 2, 0, 0]}
          userData={{ name: "Sketchfab_model" }}
        >
          <group name="root" userData={{ name: "root" }}>
            <group
              name="GLTF_SceneRootNode"
              rotation={[Math.PI / 2, 0, 0]}
              userData={{ name: "GLTF_SceneRootNode" }}
            >
              <group
                name="gds142_0"
                position={[1282.90625, -140.08085632, -4484.69628906]}
                userData={{ name: "gds.142_0" }}
              >
                <mesh
                  name="Object_4"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_4.geometry}
                  material={materials.Water}
                  userData={{ name: "Object_4" }}
                />
              </group>
              <group
                name="gds001_1"
                position={[578.7442627, -16.45561981, -4296.25927734]}
                userData={{ name: "gds.001_1" }}
              >
                <mesh
                  name="Object_6"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_6.geometry}
                  material={materials.Trees_Sheet}
                  userData={{ name: "Object_6" }}
                />
              </group>
              <group
                name="gds002_2"
                position={[-638.24926758, -19.74160194, -4356.515625]}
                userData={{ name: "gds.002_2" }}
              >
                <mesh
                  name="Object_8"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_8.geometry}
                  material={materials.tunnel_textures}
                  userData={{ name: "Object_8" }}
                />
              </group>
              <group
                name="gds003_3"
                position={[-8.87150097, 14.32289791, -3698.95141602]}
                userData={{ name: "gds.003_3" }}
              >
                <mesh
                  name="Object_10"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_10.geometry}
                  material={materials.Metal}
                  userData={{ name: "Object_10" }}
                />
              </group>
              <group
                name="gds004_4"
                position={[469.262146, -18.1898613, -4512.24609375]}
                userData={{ name: "gds.004_4" }}
              >
                <mesh
                  name="Object_12"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_12.geometry}
                  material={materials.lotta_walls}
                  userData={{ name: "Object_12" }}
                />
              </group>
              <group
                name="gds005_5"
                position={[274.34552002, -12.29425335, -4851.86035156]}
                userData={{ name: "gds.005_5" }}
              >
                <mesh
                  name="Object_14"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_14.geometry}
                  material={materials.Old_Bricks}
                  userData={{ name: "Object_14" }}
                />
              </group>
              <group
                name="gds006_6"
                position={[-419.48654175, -18.48854256, -4352.50732422]}
                userData={{ name: "gds.006_6" }}
              >
                <mesh
                  name="Object_16"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_16.geometry}
                  material={materials.highway_wall_2}
                  userData={{ name: "Object_16" }}
                />
              </group>
              <group
                name="gds007_7"
                position={[530.39129639, -34.00653458, -4261.30322266]}
                userData={{ name: "gds.007_7" }}
              >
                <mesh
                  name="Object_18"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_18.geometry}
                  material={materials.Concrete_Trimsheet}
                  userData={{ name: "Object_18" }}
                />
              </group>
              <group
                name="gds008_8"
                position={[172.74909973, -25.52419662, -4341.95068359]}
                userData={{ name: "gds.008_8" }}
              >
                <mesh
                  name="Object_20"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_20.geometry}
                  material={materials.barriers}
                  userData={{ name: "Object_20" }}
                />
              </group>
              <group
                name="gds009_9"
                position={[231.55664063, -22.4251194, -4409.87402344]}
                userData={{ name: "gds.009_9" }}
              >
                <mesh
                  name="Object_22"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_22.geometry}
                  material={materials["OFFICIAL_MARKINGS."]}
                  userData={{ name: "Object_22" }}
                />
              </group>
              <group
                name="gds010_10"
                position={[316.46994019, -17.55851555, -4482.54785156]}
                userData={{ name: "gds.010_10" }}
              >
                <mesh
                  name="Object_24"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_24.geometry}
                  material={materials.older_sidewalk_trim}
                  userData={{ name: "Object_24" }}
                />
              </group>
              <group
                name="gds011_11"
                position={[219.38082886, -12.60818005, -4163.52197266]}
                userData={{ name: "gds.011_11" }}
              >
                <mesh
                  name="Object_26"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_26.geometry}
                  material={materials.Cracked_Asphalt}
                  userData={{ name: "Object_26" }}
                />
              </group>
              <group
                name="gds012_12"
                position={[-518.25109863, -12.59062386, -4260.21289063]}
                userData={{ name: "gds.012_12" }}
              >
                <mesh
                  name="Object_28"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_28.geometry}
                  material={materials["bike_lane.001"]}
                  userData={{ name: "Object_28" }}
                />
              </group>
              <group
                name="gds013_13"
                position={[-289.58972168, 8.29551125, -4219.45410156]}
                userData={{ name: "gds.013_13" }}
              >
                <mesh
                  name="Object_30"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_30.geometry}
                  material={materials.Intersection}
                  userData={{ name: "Object_30" }}
                />
              </group>
              <group
                name="gds014_14"
                position={[641.25415039, 2.15738368, -4332.78613281]}
                userData={{ name: "gds.014_14" }}
              >
                <mesh
                  name="Object_32"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_32.geometry}
                  material={materials.bride_underside_1}
                  userData={{ name: "Object_32" }}
                />
              </group>
              <group
                name="gds015_15"
                position={[451.5128479, -28.92095757, -4319.94726563]}
                userData={{ name: "gds.015_15" }}
              >
                <mesh
                  name="Object_34"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_34.geometry}
                  material={materials.highway}
                  userData={{ name: "Object_34" }}
                />
              </group>
              <group
                name="gds016_16"
                position={[384.95767212, -11.17804432, -4338.27880859]}
                userData={{ name: "gds.016_16" }}
              >
                <mesh
                  name="Object_36"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_36.geometry}
                  material={materials.beams_transparent}
                  userData={{ name: "Object_36" }}
                />
              </group>
              <group
                name="gds017_17"
                position={[336.99157715, -8.78816986, -4332.94287109]}
                userData={{ name: "gds.017_17" }}
              >
                <mesh
                  name="Object_38"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_38.geometry}
                  material={materials.metal_beams}
                  userData={{ name: "Object_38" }}
                />
              </group>
              <group
                name="gds018_18"
                position={[474.07022095, -31.87104416, -4267.40429688]}
                userData={{ name: "gds.018_18" }}
              >
                <mesh
                  name="Object_40"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_40.geometry}
                  material={materials.highway_wall}
                  userData={{ name: "Object_40" }}
                />
              </group>
              <group
                name="gds019_19"
                position={[431.89050293, -22.16356659, -4123.45458984]}
                userData={{ name: "gds.019_19" }}
              >
                <mesh
                  name="Object_42"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_42.geometry}
                  material={materials.Main_Grass}
                  userData={{ name: "Object_42" }}
                />
              </group>
              <group
                name="gds020_20"
                position={[461.48394775, -12.06750107, -4433.51416016]}
                userData={{ name: "gds.020_20" }}
              >
                <mesh
                  name="Object_44"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_44.geometry}
                  material={materials.Generic_Brick}
                  userData={{ name: "Object_44" }}
                />
              </group>
              <group
                name="gds021_21"
                position={[14.6589241, -21.34598923, -4128.21582031]}
                userData={{ name: "gds.021_21" }}
              >
                <mesh
                  name="Object_46"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_46.geometry}
                  material={materials.Rubble_Ground}
                  userData={{ name: "Object_46" }}
                />
              </group>
              <group
                name="gds022_22"
                position={[312.39401245, -10.03261566, -4115.10058594]}
                userData={{ name: "gds.022_22" }}
              >
                <mesh
                  name="Object_48"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_48.geometry}
                  material={materials["road_one_laner.001"]}
                  userData={{ name: "Object_48" }}
                />
              </group>
              <group
                name="gds023_23"
                position={[123.30020142, -19.94741821, -4586.57128906]}
                userData={{ name: "gds.023_23" }}
              >
                <mesh
                  name="Object_50"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_50.geometry}
                  material={materials["newer_road.001"]}
                  userData={{ name: "Object_50" }}
                />
              </group>
              <group
                name="gds024_24"
                position={[-564.19445801, 2.31174707, -4151.27636719]}
                userData={{ name: "gds.024_24" }}
              >
                <mesh
                  name="Object_52"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_52.geometry}
                  material={materials.nyc_road}
                  userData={{ name: "Object_52" }}
                />
              </group>
              <group
                name="gds025_25"
                position={[-645.82824707, -7.21406031, -4311.85009766]}
                userData={{ name: "gds.025_25" }}
              >
                <mesh
                  name="Object_54"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_54.geometry}
                  material={materials.Highway_Wall_Sheet}
                  userData={{ name: "Object_54" }}
                />
              </group>
              <group
                name="gds026_26"
                position={[-705.45776367, -9.55949974, -4330.14892578]}
                userData={{ name: "gds.026_26" }}
              >
                <mesh
                  name="Object_56"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_56.geometry}
                  material={materials.Bunker_wall}
                  userData={{ name: "Object_56" }}
                />
              </group>
              <group
                name="gds027_27"
                position={[-46.48974609, 18.53202438, -4316.84863281]}
                userData={{ name: "gds.027_27" }}
              >
                <mesh
                  name="Object_58"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_58.geometry}
                  material={materials.fence_transparent}
                  userData={{ name: "Object_58" }}
                />
              </group>
              <group
                name="gds028_28"
                position={[35.52711105, 9.19612694, -3895.95556641]}
                userData={{ name: "gds.028_28" }}
              >
                <mesh
                  name="Object_60"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_60.geometry}
                  material={materials.zebra_crossings_new}
                  userData={{ name: "Object_60" }}
                />
              </group>
              <group
                name="gds029_29"
                position={[1.37953794, -1.85599601, -4163.55371094]}
                userData={{ name: "gds.029_29" }}
              >
                <mesh
                  name="Object_62"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_62.geometry}
                  material={materials.original_sidewalks}
                  userData={{ name: "Object_62" }}
                />
              </group>
              <group
                name="gds030_30"
                position={[347.94384766, -19.73848724, -4354.27734375]}
                userData={{ name: "gds.030_30" }}
              >
                <mesh
                  name="Object_64"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_64.geometry}
                  material={materials.bridge_structure_texture_generic}
                  userData={{ name: "Object_64" }}
                />
              </group>
              <group
                name="gds031_31"
                position={[91.81168365, 7.1829195, -4386.22509766]}
                userData={{ name: "gds.031_31" }}
              >
                <mesh
                  name="Object_66"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_66.geometry}
                  material={materials.Bridge_Fence_Trim}
                  userData={{ name: "Object_66" }}
                />
              </group>
              <group
                name="gds032_32"
                position={[423.9498291, -23.75082016, -4592.39599609]}
                userData={{ name: "gds.032_32" }}
              >
                <mesh
                  name="Object_68"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_68.geometry}
                  material={materials.Toned_Bricks}
                  userData={{ name: "Object_68" }}
                />
              </group>
              <group
                name="gds033_33"
                position={[411.70742798, -19.59465027, -4365.64453125]}
                userData={{ name: "gds.033_33" }}
              >
                <mesh
                  name="Object_70"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_70.geometry}
                  material={materials.Old_Grass}
                  userData={{ name: "Object_70" }}
                />
              </group>
              <group
                name="gds034_34"
                position={[1653.76074219, -33.07272339, -5085.70703125]}
                userData={{ name: "gds.034_34" }}
              >
                <mesh
                  name="Object_72"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_72.geometry}
                  material={materials.Bridge_Fence_Trim_Transparent}
                  userData={{ name: "Object_72" }}
                />
              </group>
              <group
                name="gds035_35"
                position={[1509.55639648, -60.35112, -4906.23291016]}
                userData={{ name: "gds.035_35" }}
              >
                <mesh
                  name="Object_74"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_74.geometry}
                  material={materials.Stone_Wall}
                  userData={{ name: "Object_74" }}
                />
              </group>
              <group
                name="gds036_36"
                position={[-321.14395142, 52.93077469, -4359.21240234]}
                userData={{ name: "gds.036_36" }}
              >
                <mesh
                  name="Object_76"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_76.geometry}
                  material={materials.City_Block_1}
                  userData={{ name: "Object_76" }}
                />
              </group>
              <group
                name="gds037_37"
                position={[425.87619019, -24.91664124, -4454.27539063]}
                userData={{ name: "gds.037_37" }}
              >
                <mesh
                  name="Object_78"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_78.geometry}
                  material={materials.Rock}
                  userData={{ name: "Object_78" }}
                />
              </group>
              <group
                name="gds038_38"
                position={[-202.38058472, 59.07023239, -3716.87548828]}
                userData={{ name: "gds.038_38" }}
              >
                <mesh
                  name="Object_80"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_80.geometry}
                  material={materials.City_Block_3}
                  userData={{ name: "Object_80" }}
                />
              </group>
              <group
                name="gds039_39"
                position={[-660.15979004, 184.85562134, -4343.60791016]}
                userData={{ name: "gds.039_39" }}
              >
                <mesh
                  name="Object_82"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_82.geometry}
                  material={materials.Tower}
                  userData={{ name: "Object_82" }}
                />
              </group>
              <group
                name="gds040_40"
                position={[376.16012573, -0.56654769, -4482.81835938]}
                userData={{ name: "gds.040_40" }}
              >
                <mesh
                  name="Object_84"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_84.geometry}
                  material={materials.Green_Highway_Railing}
                  userData={{ name: "Object_84" }}
                />
              </group>
              <group
                name="gds041_41"
                position={[91.7928009, 21.17327309, -4465.74609375]}
                userData={{ name: "gds.041_41" }}
              >
                <mesh
                  name="Object_86"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_86.geometry}
                  material={materials.material_0}
                  userData={{ name: "Object_86" }}
                />
              </group>
              <group
                name="gds042_42"
                position={[151.1985321, -30.76838684, -4403.08886719]}
                userData={{ name: "gds.042_42" }}
              >
                <mesh
                  name="Object_88"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_88.geometry}
                  material={materials.Graffiti}
                  userData={{ name: "Object_88" }}
                />
              </group>
              <group
                name="gds043_43"
                position={[140.09414673, -2.87698269, -4341.42626953]}
                userData={{ name: "gds.043_43" }}
              >
                <mesh
                  name="Object_90"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_90.geometry}
                  material={materials.Bridge_Baked}
                  userData={{ name: "Object_90" }}
                />
              </group>
              <group
                name="gds044_44"
                position={[-384.91470337, 60.05848312, -4023.2487793]}
                userData={{ name: "gds.044_44" }}
              >
                <mesh
                  name="Object_92"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_92.geometry}
                  material={materials.City_Block_2}
                  userData={{ name: "Object_92" }}
                />
              </group>
              <group
                name="gds045_45"
                position={[289.92025757, 12.66812611, -4631.91015625]}
                userData={{ name: "gds.045_45" }}
              >
                <mesh
                  name="Object_94"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_94.geometry}
                  material={materials.Garage}
                  userData={{ name: "Object_94" }}
                />
              </group>
              <group
                name="gds046_46"
                position={[1799.97216797, -30.50191307, -5091.82373047]}
                userData={{ name: "gds.046_46" }}
              >
                <mesh
                  name="Object_96"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_96.geometry}
                  material={materials.Bridge_Trimsheet}
                  userData={{ name: "Object_96" }}
                />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

useGLTF.preload("/newyork1k.glb");
