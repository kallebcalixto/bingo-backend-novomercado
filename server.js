import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import axios from 'axios'; // Usaremos o axios para atualizar o Firebase sem travar o boot

const server = express();
server.use(express.json());
server.use(cors());

// 🔑 SEU ACCESS TOKEN FIXO
const TOKEN_MERCADO_PAGO = 'APP_USR-4600187372479747-052312-f671609e2fc63fac76626413c52cde70-1258641529';
const client = new MercadoPagoConfig({ accessToken: TOKEN_MERCADO_PAGO });
const payment = new Payment(client);

// URL Base do seu Firebase Realtime Database
const FIREBASE_DB_URL = "https://azar-c7f24-default-rtdb.firebaseio.com";

// Rota de teste para checar estabilidade
server.get('/', (req, res) => {
    res.send('Servidor do Bingo Online e Blindado!');
});

// 1. ROTA QUE CRIA O PIX
server.post('/criar-pix', async (req, res) => {
    const { uid, valor, email } = req.body;
    
    if (!uid || !valor) {
        return res.status(400).json({ error: 'Dados insuficientes.' });
    }

    try {
        const response = await payment.create({
            body: {
                transaction_amount: Number(valor),
                description: `Recarga Bingo - ID ${uid}`,
                payment_method_id: 'pix',
                payer: { email: email || 'usuario@bingo.com' },
                metadata: { 
                    user_id: uid 
                }
            }
        });

        const copiaCola = response.point_of_interaction?.transaction_data?.qr_code;
        return res.json({ copiaCola });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
});

// 2. ROTA DE WEBHOOK (Processa o aviso de pagamento do Mercado Pago e injeta no Firebase)
server.post('/webhook', async (req, res) => {
    const { action, data } = req.body;

    if (action === "payment.created" || req.query.type === "payment" || action === "payment.updated") {
        const idPagamento = data?.id || req.body?.data?.id;

        if (idPagamento) {
            try {
                const p = await payment.get({ id: idPagamento });
                
                if (p.status === "approved") {
                    const uidUsuario = p.metadata?.user_id;
                    const valorPago = parseFloat(p.transaction_amount);

                    if (uidUsuario && valorPago > 0) {
                        // Faz uma chamada REST direta no Firebase para buscar os créditos atuais do jogador
                        const userUrl = `${FIREBASE_DB_URL}/users/${uidUsuario}.json`;
                        const userSnap = await axios.get(userUrl);
                        
                        let creditosAtuais = 0;
                        if (userSnap.data && userSnap.data.creditos) {
                            creditosAtuais = parseFloat(userSnap.data.creditos) || 0;
                        }

                        // Soma o novo valor pago e atualiza o Firebase instantaneamente via PATCH
                        const novoSaldo = creditosAtuais + valorPago;
                        await axios.patch(userUrl, { creditos: novoSaldo });

                        console.log(`✅ Sucesso! R$ ${valorPago} adicionados à conta do ID: ${uidUsuario}`);
                    }
                }
            } catch (err) {
                console.error("Erro no processamento interno do webhook:", err.message);
            }
        }
    }

    return res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
