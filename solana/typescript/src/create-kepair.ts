
import fs from "fs";

import { Keypair } from "@solana/web3.js";

import { Command } from "commander-ts";

/************************************************************************
 * Node command to generate a Solana keypair and write it to the working  
 * directory as id.json.
 * 
 * Must be transpiled.
 */

const pgm = new Command();

pgm.version("0.0.1")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    const keypairPath = "./id.json"

    // Check that the keypair exists
    if (fs.existsSync(keypairPath)) {
        console.error(`Solana keypair file ${keypairPath} exists.`);
        return;
    }

    const keypair = Keypair.generate();
    const secretKeyArray = Array.from(keypair.secretKey);
    const jsonString = JSON.stringify(secretKeyArray);

    fs.writeFileSync("id.json", jsonString);
    console.log(`Keypair for ${keypair.publicKey.toBase58()} saved to id.json`);

})();