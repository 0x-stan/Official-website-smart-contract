import * as hre from "hardhat";
import path from "path";
import { deployContract, getWallet } from "./utils";
import { ethers } from "ethers";
import { encodePacked, keccak256, parseEther, toHex } from "viem";
import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";
import Vkey from "./lib/zksnark/verification_key.json";

function hashToken(account: `0x${string}`) {
  return Buffer.from(
    keccak256(encodePacked(["address"], [account])).slice(2),
    "hex",
  );
}

function convertCallData(calldata: string) {
  const argv = calldata.replace(/["[\]\s]/g, "").split(",");

  const a = [argv[0], argv[1]];
  const b = [
    [argv[2], argv[3]],
    [argv[4], argv[5]],
  ];
  const c = [argv[6], argv[7]];

  let input = [];
  // const input = [argv[8], argv[9]];
  for (let i = 8; i < argv.length; i++) {
    input.push(argv[i] as never);
  }

  return { a, b, c, input };
}

const calcProof = async (input: string) => {
  const proveRes = await groth16.fullProve(
    { in: keccak256(toHex(input)) },
    path.join(__dirname, "./lib/zksnark/datahash.wasm"),
    path.join(__dirname, "./lib/zksnark/circuit_final.zkey"),
  );
  console.log("calculateProof proveRes", proveRes);
  console.log(Vkey);

  const res = await groth16.verify(
    Vkey,
    proveRes.publicSignals,
    proveRes.proof,
  );

  if (res) {
    console.log("calculateProof verify passed!");

    const proof = convertCallData(
      await groth16.exportSolidityCallData(
        proveRes.proof,
        proveRes.publicSignals,
      ),
    );

    return {
      proof: proof,
      publicSignals: proveRes.publicSignals,
    };
  } else {
    console.error("calculateProof verify faild.");
    return null;
  }
};

// Address of the contract to interact with
// const CONTRACT_ADDRESS = ""; // zksync mainnet
const CONTRACT_ADDRESS = "0x607Ca6dA301ecaf972EF64ae8764Ae998ADF3eb7"; // zksync sepolia
if (!CONTRACT_ADDRESS)
  throw "⛔️ Provide address of the contract to interact with!";

// sepolia SimpleToken address 0xD9a42d80741D4CE4513c16a70032C3B95cbB0CCE

// zero bytes
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// An example of a script to interact with the contract
export default async function () {
  console.log(`Running script to interact with contract ${CONTRACT_ADDRESS}`);

  // Load compiled contract info
  const contractArtifact = await hre.artifacts.readArtifact("Groth16Verifier");

  const wallet = getWallet();

  // Initialize contract instance for interaction
  const verifier = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet, // Interact with the contract on behalf of this wallet
  );

  const password = "123456abcd";
  const proofRes = await calcProof(password);
  if (proofRes) {
    const {
      proof: { a, b, c },
      publicSignals,
    } = proofRes;
    const res = await verifier.verifyProof(a, b, c, publicSignals);
    console.log("verifier.verifyProof()", res);
  }
}
