import fs from "fs";

import { Command } from "commander-ts";
import { Wallet } from "ethers";

/**************************************************************************************
 * Node command to print the public address of an existing EVM wallet stored as wallet.json.
 * 
 * Use this if you need to recover your wallet's public address after creation.
 * 
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Create a new EVM wallet")
    .requiredOption("-wp --walletPassword <password for the json file>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    const walletPath = "./wallet.json"

    // Check that the wallet exists
    if (!fs.existsSync(walletPath)) {
        console.error(`wallet file ${walletPath} missing.`);
        return;
    }

    const json = fs.readFileSync(walletPath, "utf-8");
    const wallet = Wallet.fromEncryptedJsonSync(json, options.walletPassword)
    console.log(`wallet public address: ${wallet.address}`);

})();