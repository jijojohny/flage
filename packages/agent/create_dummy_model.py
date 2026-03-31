import os
import torch
from src.models.trading_model import FlageTradingModel, ModelConfig

config = ModelConfig(num_pairs=2, hidden_dim=64, num_heads=4, num_layers=2, dropout=0.1)
model = FlageTradingModel(config)
model.eval()
scripted = torch.jit.trace(model, torch.zeros(1, 2 * 5), check_trace=False)
os.makedirs("/app/model", exist_ok=True)
scripted.save("/app/model/model.pt")
print("Saved dummy model -> /app/model/model.pt")
