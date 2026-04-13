import { AccountMeta, Connection, sendAndConfirmTransaction, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

import { SerializedAccountMeta, SerializedInstruction } from "./interfaces";

export function deserializeAccountMetas(serialized: SerializedAccountMeta[]): AccountMeta[] {
    const ra: AccountMeta[] = [];

    if (!serialized) {
        return ra;
    }

    for (let i = 0; i < serialized.length; i++) {
        ra.push({
            pubkey: new anchor.web3.PublicKey(serialized[i]!.pubkey),
            isSigner: serialized[i]!.isSigner,
            isWritable: serialized[i]!.isWritable,
        });
    }

    return ra;
}

export async function deserializeIxSignAndSend(
    connection: Connection,
    serializedIx: SerializedInstruction,
    keypair: anchor.web3.Keypair) {

    const ix: TransactionInstruction = {
        keys: deserializeAccountMetas(serializedIx.keys),
        programId: new anchor.web3.PublicKey(serializedIx.programId),
        data: Buffer.from(serializedIx.data, "base64"),
    }

    await signAndSendInstructions(connection, [ix], keypair);
}

export async function signAndSendInstructions(
    connection: Connection,
    instructions: TransactionInstruction[],
    keypair: anchor.web3.Keypair) {

    let latestBlockhash = await connection.getLatestBlockhash();
    console.info(`[solana] rpc endpoint: ${connection.rpcEndpoint}`);
    console.info(`[solana] preparing ${instructions.length} instruction(s) for ${keypair.publicKey.toBase58()}`);
    instructions.forEach((instruction, index) => {
        console.info(
            `[solana] instruction[${index}] program=${instruction.programId.toBase58()} ` +
            `accounts=${instruction.keys.length} dataLength=${instruction.data.length}`
        );
    });
    console.info(
        `[solana] latest blockhash=${latestBlockhash.blockhash} ` +
        `lastValidBlockHeight=${latestBlockhash.lastValidBlockHeight}`
    );

    const wallet = new anchor.Wallet(keypair);
    const unsigned = new Transaction();
    for (const instruction of instructions) {
        unsigned.add(instruction);
    }
    unsigned.feePayer = wallet.publicKey;
    unsigned.recentBlockhash = latestBlockhash.blockhash;
    unsigned.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    const signed = await wallet.signTransaction(unsigned);
    const txSig = await sendAndConfirmTransaction(
        connection,
        signed,
        [keypair],
        { commitment: "confirmed" });
    console.info(`[solana] transaction signature: ${txSig}`);
}
