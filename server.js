// 2. ROTA DE WEBHOOK (Versão Segura contra duplicidade)
server.post('/webhook', async (req, res) => {
    const { action, data } = req.body;

    if (action === "payment.created" || req.query.type === "payment" || action === "payment.updated") {
        const idPagamento = data?.id || req.body?.data?.id;

        if (idPagamento) {
            try {
                // 1. Verifica se já processamos este ID antes para evitar duplicidade
                const logRef = db.ref(`logs_pagamentos/${idPagamento}`);
                const logSnap = await axios.get(`${FIREBASE_DB_URL}/logs_pagamentos/${idPagamento}.json`);
                
                if (logSnap.data) {
                    return res.status(200).send('Já processado'); // Ignora se já foi pago
                }

                const p = await payment.get({ id: idPagamento });
                
                if (p.status === "approved") {
                    const uidUsuario = p.metadata?.user_id;
                    const valorPago = parseFloat(p.transaction_amount);

                    if (uidUsuario && valorPago > 0) {
                        const userUrl = `${FIREBASE_DB_URL}/users/${uidUsuario}.json`;
                        const userSnap = await axios.get(userUrl);
                        
                        let creditosAtuais = parseFloat(userSnap.data?.creditos) || 0;
                        await axios.patch(userUrl, { creditos: creditosAtuais + valorPago });
                        
                        // 2. Registra o ID do pagamento para nunca mais processar ele
                        await axios.put(`${FIREBASE_DB_URL}/logs_pagamentos/${idPagamento}.json`, { status: 'processado', timestamp: Date.now() });

                        console.log(`✅ Sucesso! R$ ${valorPago} adicionados. ID: ${idPagamento}`);
                    }
                }
            } catch (err) {
                console.error("Erro no webhook:", err.message);
            }
        }
    }
    return res.status(200).send('OK');
});
