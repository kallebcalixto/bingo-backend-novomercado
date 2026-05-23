import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import admin from 'firebase-admin';

const server = express();
server.use(express.json());
server.use(cors());

// 🔑 CONFIGURAÇÃO DO FIREBASE ADMIN (Para o servidor poder alterar o saldo)
// Como o Firebase já está configurado no seu app, usamos a URL do seu Banco de Dados
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.applicationDefault(), // O Render lê as credenciais automaticamente se configurado, ou você pode usar o fluxo padrão do Realtime
        databaseURL: "https://azar-c7f24-default-rtdb.firebaseio.com"
    });
}
const db = admin.database();

// 🔑 SEU ACCESS TOKEN FIXO
const TOKEN_MERCADO_PAGO = 'APP_USR-4600187372479747-052312-f671609e2fc63fac76626413c52cde70-1258641529';
const client = new MercadoPagoConfig({ accessToken: TOKEN_MERCADO_PAGO });
const payment = new Payment(client);

// Rota de teste
server.get('/', (req, res) => {
    res.send('Servidor do Bingo com Webhook Ativo!');
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
                    user_id: uid // Guardamos o ID do usuário aqui para saber quem pagou depois
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

// 2. 🚨 NOVA ROTA: WEBHOOK (O Mercado Pago avisa aqui quando o Pix for pago)
server.post('/webhook', async (req, res) => {
    const { action, data } = req.body;

    // Se o aviso for de um pagamento realizado
    if (action === "payment.created" || req.query.type === "payment" || action === "payment.updated") {
        const idPagamento = data?.id || req.body?.data?.id;

        if (idPagamento) {
            try {
                // Consulta o Mercado Pago para ver o status real desse pagamento
                const p = await payment.get({ id: idPagamento });
                
                // Se o status for "approved" (pago com sucesso!)
                if (p.status === "approved") {
                    const uidUsuario = p.metadata?.user_id;
                    const valorPago = parseFloat(p.transaction_amount);

                    if (uidUsuario && valorPago > 0) {
                        const userRef = db.ref(`users/${uidUsuario}`);
                        
                        // Busca o saldo atual do cara e soma o novo valor
                        await userRef.transaction((currentData) => {
                            if (currentData) {
                                let saldoAtual = parseFloat(currentData.creditos) || 0;
                                currentData.creditos = saldoAtual + valorPago;
                            }
                            return currentData;
                        });

                        console.log(`✅ Saldo adicionado: R$ ${valorPago} para o usuário ${uidUsuario}`);
                    }
                }
            } catch (err) {
                console.error("Erro ao processar webhook:", err.message);
            }
        }
    }

    // O Mercado Pago exige que a gente responda com status 200 para ele não ficar reenviando o aviso
    return res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
