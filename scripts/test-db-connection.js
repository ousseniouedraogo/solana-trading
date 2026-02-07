const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

console.log('🔍 Diagnostic de connexion MongoDB...');
console.log('URI détectée (tronquée):', uri ? uri.substring(0, 30) + '...' : 'AUCUNE');

async function testConnection() {
    if (!uri) {
        console.error('❌ Erreur: MONGODB_URI n\'est pas défini dans le fichier .env');
        process.exit(1);
    }

    try {
        console.log('⏳ Tentative de connexion à MongoDB Atlas...');
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 5000
        });
        console.log('✅ CONNEXION RÉUSSIE !');
        console.log('La base de données est accessible depuis cette machine.');
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ ÉCHEC DE LA CONNEXION');
        console.error('Message d\'erreur:', error.message);

        if (error.message.includes('IP address is not whitelisted') || error.message.includes('Not whitelisted')) {
            console.log('\n💡 CAUSE PROBABLE : Votre adresse IP actuelle n\'est pas autorisée sur MongoDB Atlas.');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 CAUSE PROBABLE : Le serveur MongoDB n\'est pas joignable (problème réseau ou serveur éteint).');
        } else if (error.message.includes('Authentication failed')) {
            console.log('\n💡 CAUSE PROBABLE : Le nom d\'utilisateur ou le mot de passe dans MONGODB_URI est incorrect.');
        }

        console.log('\n🛠️ ACTIONS RECOMMANDÉES :');
        console.log('1. Allez sur https://cloud.mongodb.com/');
        console.log('2. Connectez-vous et allez dans "Network Access".');
        console.log('3. Cliquez sur "Add IP Address".');
        console.log('4. Cliquez sur "Add Current IP Address" ou "Allow Access from Anywhere" (0.0.0.0/0).');
        console.log('5. Attendez 1-2 minutes que le changement soit appliqué et réessayez.');

        process.exit(1);
    }
}

testConnection();
