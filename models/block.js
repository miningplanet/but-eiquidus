const mongoose = require('mongoose')
const Schema = mongoose.Schema

const BlockSchema = new Schema({
  hash: { type: String, unique: true, default: '', index: true },
  pow_hash: { type: String, default: '', index: false },
  algo: { type: String, default: '', index: false },
  size: { type: Number, default: 0, index: false },
  height: { type: Number, default: 0, index: true },
  version: {type: Number, default: 0, index: false},
  merkle_root: { type: String, default: '', index: false },
  numtx: { type: Number, default: 0, index: false },
  chainwork: { type: String, default: '', index: false },
  prev_hash: { type: String, default: '', index: false },
  next_hash: { type: String, default: '', index: false },
  time: {type: Number, default: 0, index: false},
  mediantime: { type: String, default: '', index: false },
  nonce: { type: String, default: '', index: false },
  bits: { type: String, default: '', index: false },
  difficulty: {type: Number, default: 0, index: false},
  chainlock: { type: Boolean, default: false, index: false },
  cbtx: { type: Array, default: [], index: false },
}, {id: false})

module.exports = BlockSchema