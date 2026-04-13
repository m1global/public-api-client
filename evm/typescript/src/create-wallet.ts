import fs from "fs";

import { Command } from "commander-ts";
import { Wallet } from "ethers";

/**************************************************************************************
 * Node command to create a new EVM wallet via ethers and store it to a local json file.
 * 
 * The public address of the wallet must be conveyed to M1 Global for whitelisting or
 *  subsequent calls to the M1 API such as deposit will all fail.
 * 
 * Must be transpiled (npm run build).
 */

const pgm = new Command();

pgm.version("0.0.1")
    .description("Create a new EVM wallet")
    .requiredOption("-p --password <password for the json file>")
    .parse(process.argv);

const options = pgm.opts();

(async () => {

    const walletPath = "./wallet.json"

    // Check that the wallet exists
    if (fs.existsSync(walletPath)) {
        console.error(`wallet file ${walletPath} exists.`);
        return;
    }

    const newWallet = Wallet.createRandom();
    const json = await newWallet.encrypt(options.password);
    fs.writeFileSync("./wallet.json", json, { "encoding": "utf-8" });
    console.log(`created wallet with public address: ${newWallet.address}`);
})();