const ImageKit = require("imagekit");

const imagekit = new ImageKit({
  publicKey: "public_qlvVXSF8e/26L2Jp/x9nlWKtQRU=",
  privateKey: "private_tALak2DrGtWTF5EUPqIg9oAJiFE=",
  urlEndpoint: "https://ik.imagekit.io/wztzoqatw", // e.g. https://ik.imagekit.io/your_id
});

module.exports = imagekit;
