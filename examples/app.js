const bitdb = require("../index")
bitdb.read({
  request: {
    encoding: { "b1": "hex" },
    find: { "b1": { $in: ["6d02", "6d0c"] } },
    project: { _id: 0, s1: 1, s2: 1 }
  }
}, function(err, res) {
  console.log(res)
  bitdb.exit()
})
