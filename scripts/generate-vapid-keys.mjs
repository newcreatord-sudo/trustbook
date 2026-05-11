import { createECDH } from 'node:crypto'

function base64Url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

const subjectArg = process.argv.find((x) => x.startsWith('--subject=')) ?? null
const subject = subjectArg ? subjectArg.slice('--subject='.length).trim() : 'mailto:support@trustbook.it'

const ecdh = createECDH('prime256v1')
ecdh.generateKeys()

const publicKey = base64Url(ecdh.getPublicKey(null, 'uncompressed'))
const privateKey = base64Url(ecdh.getPrivateKey())

process.stdout.write(`WEB_PUSH_VAPID_SUBJECT=${subject}\n`)
process.stdout.write(`WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}\n`)
process.stdout.write(`WEB_PUSH_VAPID_PRIVATE_KEY=${privateKey}\n`)
process.stdout.write(`VITE_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}\n`)
