require('dotenv').config()
require('@nomicfoundation/hardhat-chai-matchers')
require('@openzeppelin/hardhat-upgrades')
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-etherscan')
require('hardhat-gas-reporter')
require('solidity-docgen')


module.exports = {
	defaultNetwork: "hardhat",
	networks: {
		localhost: {
			url: "http://127.0.0.1:8545",
			blockGasLimit: 5e6,
			gasPrice: 5e9,
			timeout: 1_000_000
		},
		hardhat: {
			blockGasLimit: 99999999,
			forking: {
				url: process.env.rpc
			}
		},
		testnetBSC: {
			url: "https://data-seed-prebsc-1-s1.binance.org:8545",
			chainId: 97,
			gasPrice: 20e9,
		},
		mainnetBSC: {
			url: "https://bsc-dataseed.binance.org/",
			chainId: 56,
			gasLimit: 50e18,
			gasPrice: 3e9,
			accounts: [process.env.privateKeyDeployer]
		},
		testnetMatic: {
			url: "https://rpc-mumbai.maticvigil.com/",
			chainId: 80001,
			gasPrice: 20000000000,
		},
	},
	etherscan: {
		apiKey: process.env.bscScanApiKey
	},
	solidity: {
		compilers: [
			{
				version: "0.8.24",
				settings: {
					optimizer: {
						enabled: true,
						runs: 200,
					}
				}
			}
			],
		outputSelection: {
			"*": {
				"*": ["storageLayout"]
			}
		}
	},
	paths: {
		sources: "./contracts",
		tests: "./test",
		cache: "./cache",
		artifacts: "./artifacts"
	},
	mocha: {
		timeout: 200000
	},
    gasReporter: {
        enabled: false,//!!(process.env.REPORT_GAS),
        currency: 'USD',
        token: 'BNB',
        gasPriceApi: 'https://api.bscscan.com/api?module=proxy&action=eth_gasPrice',
		gasPrice: 3,
        coinmarketcap: process.env.coinmarketcupApiKey
	},
	docgen: {

	}
}
