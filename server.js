import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const server = express();
server.use(express.json());
server.use(cors());

// Configuração do Mercado Pago - Vai ler o Token direto do Painel do Render
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADO_PAGO_TOKEN 
});
const payment = new Payment(client);

// Rota de teste para ver se o Render está online
server.get('/', (req, res) => {
    res.send('Novo Servidor do Bingo Ativo e Operando!');
});

// Rota que o seu index.html vai chamar para gerar o Pix
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

        // Pega o código Copia e Cola gerado pelo Mercado Pago
        const copiaCola = response.point_of_interaction?.transaction_data?.qr_code;
        
        return res.json({ copiaCola });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
