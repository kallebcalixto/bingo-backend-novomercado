import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import https from 'https'; // Módulo nativo, não precisa instalar nada

const server = express();
server.use(express.json());
server.use(cors());

const TOKEN_MERCADO_PAGO = 'APP_USR-4600187372479747-052312-f671609e2fc63fac76626413c52cde70-1258641529';
const client = new MercadoPagoConfig({ accessToken: TOKEN_MERCADO_PAGO });
const payment = new Payment(client);
const FIREBASE_DB_URL = "azar-c7f24-default-rtdb.firebaseio.com"; // URL limpa para o HTTPS

server.get('/', (req, res) => res.send('Servidor Online!'));

// Função auxiliar para fazer requisições HTTPS sem axios
const firebaseRequest = (path, method, data = null) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: FIREBASE_DB_URL,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => resolve(JSON.parse(body || '{}')));
        });
        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
};

server.post('/criar-pix', async (req, res) => {
    const { uid, valor } = req.body;
    try {
        const response = await payment.create({
            body: { transaction_amount: Number(valor), description: `Recarga - ${uid}`, payment_method_id: 'pix', payer: { email: 'usuario@bingo.com' }, metadata: { user_id: uid } }
        });
        return res.json({ copiaCola: response.point_of_interaction.transaction_data.qr_code });
    } catch (error) { return res.status(500).json({ error: error.message }); }
});

server.post('/webhook', async (req, res) => {
    const idPagamento = req.body.data?.id;
    if (idPagamento) {
        try {
            // Verifica se já processado
            const log = await firebaseRequest(`/logs_pagamentos/${idPagamento}.json`, 'GET');
            if (log && log.status) return res.status(200).send('OK');

            const p = await payment.get({ id: idPagamento });
            if (p.status === "approved") {
                const uid = p.metadata?.user_id;
                const valor = parseFloat(p.transaction_amount);
                
                // Busca saldo e atualiza
                const user = await firebaseRequest(`/users/${uid}.json`, 'GET');
                const novoSaldo = (parseFloat(user?.creditos) || 0) + valor;
                await firebaseRequest(`/users/${uid}.json`, 'PATCH', { creditos: novoSaldo });
                await firebaseRequest(`/logs_pagamentos/${idPagamento}.json`, 'PUT', { status: 'processado' });
            }
        } catch (err) { console.log(err); }
    }
    return res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando`));
