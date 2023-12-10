const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const axios = require("axios");
const {
  FusionSDK,
  NetworkEnum,
  PrivateKeyProviderConnector,
  AuctionSalt,
  AuctionSuffix,
  FusionOrder,
} = require("@1inch/fusion-sdk");
import * as PushAPI from "@pushprotocol/restapi";
const ethers = require("ethers");
const { Web3 } = require("web3");

const app = express();
dotenv.config();

const PK = process.env.MAKER_PRIVATE_KEY;
const Pkey = `0x${PK}`;
const _signer = new ethers.Wallet(Pkey);

const user = await PushAPI.initialize(_signer, {
  env: "staging",
});

const nodeUrl =
  "https://arbitrum-goerli.infura.io/v3/aa9f2305be904939b640b4ab9cdb8895";

const blockchainProvider = new PrivateKeyProviderConnector(
  process.env.MAKER_PRIVATE_KEY,
  new Web3(nodeUrl)
);

const fusionSdk = new FusionSDK({
  url: "https://fusion.1inch.io",
  network: NetworkEnum.ETHEREUM,
  blockchainProvider: blockchainProvider,
});

app.use(cors());
app.use(express.json());

/*-----------------------------------------------------------------------------------------------------------*/

//1inch Endpoints
app.post("/fusion/quote", async (req, res) => {
  const { fromToken, toToken, amount } = req.body;

  const quoteParams = {
    fromTokenAddress: fromToken,
    toTokenAddress: toToken,
    amount: amount,
  };

  const quote = await fusionSdk.getQuote(quoteParams);
  res.json(quote);
});

app.post("/fusion/order", async (req, res) => {
  const { quote } = req.body;

  const fromTokenAddress = quote["params"]["fromTokenAddress"];
  const toTokenAddress = quote["params"]["toTokenAddress"];
  const fromTokenAmount = quote["fromTokenAmount"];
  const toTokenAmount = quote["toTokenAmount"];
  const walletAddress = quote["params"]["walletAddress"];
  const auctionDuration = quote["presets"]["fast"]["auctionDuration"];
  const startAuctionIn = quote["presets"]["fast"]["startAuctionIn"];
  const initialRateBump = quote["presets"]["fast"]["initialRateBump"];
  const bankFee = quote["presets"]["fast"]["bankFee"];
  const points = quote["presets"]["fast"]["points"];
  const whitelist = quote["whitelist"];

  const orderParams = {
    makerAsset: fromTokenAddress,
    takerAsset: toTokenAddress,
    makingAmount: fromTokenAmount,
    takingAmount: toTokenAmount,
    maker: walletAddress,
  };

  const salt = new AuctionSalt({
    duration: auctionDuration,
    auctionStartTime: startAuctionIn,
    initialRateBump: initialRateBump,
    bankFee: bankFee,
  });

  const suffix = new AuctionSuffix({
    points: points,
    whitelist: whitelist.map((element) => {
      return {
        address: element,
        allowance: 0,
      };
    }),
  });

  const order = new FusionOrder(orderParams, salt, suffix);

  const result = await fusionSdk.submitOrder(order);
  res.json(result);
});

app.post("/nfts", async (req, res) => {
  const { owners } = req.body;
  const url = "https://api.1inch.dev/nft/v1/byaddress";
  const result = [];

  await owners.map(async (element) => {
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: "Bearer kwmQtC740jj9cP37mlmGOtrU3EUSQSzZ",
        },
        params: {
          chainIds: 1,
          address: element,
        },
      });
      result.push(response.data);
      console.log(result);
    } catch (error) {
      console.error(error);
    }
    await new Promise((resolve) => setTimeout(resolve(), 1000));
  });

  res.json(result);
});

/*-----------------------------------------------------------------------------------------------------------*/

//PUSH Protocol
app.post("/createPushSpace", async (req, res) => {
  const { spaceName, spaceDescription, speakers } = req.body;
  const user = await PushAPI.user.get({
    account: `eip155:${process.env.MAKER_ADDRESS}`,
    env: "staging",
  });

  const pgpDecryptedPvtKey = await PushAPI.chat.decryptPGPKey({
    encryptedPGPPrivateKey: user.encryptedPrivateKey,
    signer: _signer,
  });

  const response = await PushAPI.space.create({
    spaceName,
    spaceDescription,
    speakers,
    rules: {
      spaceAccess: {
        conditions: [
          {
            any: [
              {
                type: "PUSH",
                category: "ERC20",
                subcategory: "holder",
                data: {
                  contract:
                    "eip155:5:0x2b9bE9259a4F5Ba6344c1b1c07911539642a2D33",
                  amount: 1000,
                  decimals: 18,
                },
              },
            ],
          },
        ],
      },
    },
    isPublic: false,
    account: process.env.MAKER_ADDRESS,
    env: "staging",
    pgpPrivateKey: pgpDecryptedPvtKey,
    scheduleAt: new Date("2023-12-09T00:00:00.000Z"),
    scheduleEnd: new Date("2023-12-11T00:00:00.000Z"),
  });
  res.json(response);
});

app.post("/getAccess", async (req, res) => {
  const { spaceId, did } = req.body;
  const response = await PushAPI.space.getAccess({
    spaceId,
    did,
    env: "staging",
  });
  res.json(response);
});

app.post("/createPushChannel", async (req, res) => {
  const { channelName, channelDescription, channelURL, base64FormatImage } =
    req.body;

  const createChannelRes = await user.channel.create({
    name: channelName,
    description: channelDescription,
    url: channelURL,
    icon: base64FormatImage,
  });

  res.json(createChannelRes);
});

app.post("/subscribeChannel", async (req, res) => {
  const { channelInCAIP, webhookUrl } = req.body;

  const subscribeStatus = await user.notification.subscribe(channelInCAIP);
  res.json(subscribeStatus);

  const stream = user.stream(process.env.MAKER_ADDRESS, {
    listen: [PushAPI.STREAM.NOTIF],
  });

  // recevive stream of notification
  user.stream.on(PushAPI.STREAM.NOTIF, (data) => {
    axios.post(webhookUrl, {
      body: data,
    });
  });
});

app.listen(3000, () => {
  console.log("Server Started!");
});
