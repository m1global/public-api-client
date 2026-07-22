import {
    AccountMeta,
    Connection,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

import { SerializedAccountMeta, SerializedInstruction, TreasuryConfig } from "./interfaces-v2";

const SOLANA_MAX_TRANSACTION_SIZE_BYTES = 1232;

export function requireTreasuryLookupTableAddress(config: TreasuryConfig): string {
    const lookupTableAddress = config.lookupTableAddress?.trim();
    if (!lookupTableAddress) {
        throw new Error("No lookupTableAddress configured for solana treasury");
    }
    return lookupTableAddress;
}

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

export async function signAndSendInstructionsV0WithLookupTable(
    connection: Connection,
    instructions: TransactionInstruction[],
    keypair: anchor.web3.Keypair,
    lookupTableAddress: string) {

    const lookupTablePubkey = new PublicKey(lookupTableAddress);
    const lookupTable = (await connection.getAddressLookupTable(lookupTablePubkey)).value;
    if (!lookupTable) {
        throw new Error(`Solana address lookup table not found: ${lookupTablePubkey.toBase58()}`);
    }
    if (lookupTable.state.addresses.length === 0) {
        throw new Error(`Solana address lookup table is empty: ${lookupTablePubkey.toBase58()}`);
    }

    const latestBlockhash = await connection.getLatestBlockhash();
    console.info(`[solana] rpc endpoint: ${connection.rpcEndpoint}`);
    console.info(`[solana] lookup table: ${lookupTablePubkey.toBase58()} addresses=${lookupTable.state.addresses.length}`);
    console.info(`[solana] preparing ${instructions.length} v0 instruction(s) for ${keypair.publicKey.toBase58()}`);
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

    const message = new TransactionMessage({
        payerKey: keypair.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions,
    }).compileToV0Message([lookupTable]);
    const tx = new VersionedTransaction(message);
    tx.sign([keypair]);

    const serialized = tx.serialize();
    console.info(`[solana] versioned transaction size=${serialized.length}`);
    if (serialized.length > SOLANA_MAX_TRANSACTION_SIZE_BYTES) {
        throw new Error(`Solana versioned transaction too large: ${serialized.length} > ${SOLANA_MAX_TRANSACTION_SIZE_BYTES}`);
    }

    const txSig = await connection.sendTransaction(tx);
    const confirmation = await connection.confirmTransaction({
        signature: txSig,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, "confirmed");
    if (confirmation.value.err) {
        throw new Error(`Solana transaction failed: ${txSig} ${JSON.stringify(confirmation.value.err)}`);
    }
    console.info(`[solana] transaction signature: ${txSig}`);
}
