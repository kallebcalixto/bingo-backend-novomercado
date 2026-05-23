import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const server = express();
server.use(express.json());
server.use(cors());

// COLOQUEI SEU ACCESS TOKEN REAL DIRETO NO CÓDIGO PARA NÃO DAR ERRO
const TOKEN_MERCADO_PAGO = 'APP_USR-4600187372479747-052312-f671609e2fc63fac76626413c52cde70-1258641529';

// O sistema tenta ler o Render, se não achar, usa o token fixo acima obrigatoriamente
const tokenFinal = process.env.MERCADO_PAGO_TOKEN || TOKEN_MERCADO_PAGO;

const client = new MercadoPagoConfig({ 
    accessToken: tokenFinal 
});
const payment = new Payment(client);

// Rota de teste
server.get('/', (req, res) => {
    res.send('Novo Servidor do Bingo Ativo e Operando com Token Fixo!');
});

// Rota que gera o Pix
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
                payer: {
                    email: email || 'usuario@bingo.com'
                },
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
