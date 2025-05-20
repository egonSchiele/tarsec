import { describe, expect, it } from "vitest";
import { pythonParser } from "./python";
import { success } from "@/lib/types";

describe("Python Parser - Complex Examples", () => {
  it("should parse a data science style application", () => {
    const input = `
# Data Analysis Example
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression

# Load and prepare data
def load_data(filename):
    """
    Load data from a CSV file and prepare it for analysis
    """
    data = pd.read_csv(filename)
    return data

def preprocess_data(data):
    # Handle missing values
    data = data.fillna(data.mean())
    
    # Feature engineering
    data['feature_squared'] = data['feature'] ** 2
    data['feature_log'] = np.log(data['feature'] + 1)
    
    return data

# Model training
class ModelTrainer:
    def __init__(self, model_type='linear'):
        self.model_type = model_type
        self.model = None
    
    def train(self, X, y):
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        if self.model_type == 'linear':
            self.model = LinearRegression()
            self.model.fit(X_train, y_train)
        else:
            raise ValueError("Unsupported model type")
            
        # Evaluate
        train_score = self.model.score(X_train, y_train)
        test_score = self.model.score(X_test, y_test)
        
        return {
            'model': self.model,
            'train_score': train_score,
            'test_score': test_score,
            'X_test': X_test,
            'y_test': y_test
        }
    
    def predict(self, X):
        if self.model is None:
            raise ValueError("Model not trained yet")
        return self.model.predict(X)

# Visualization
def plot_results(X_test, y_test, y_pred):
    plt.figure(figsize=(10, 6))
    plt.scatter(X_test, y_test, color='blue', label='Actual')
    plt.scatter(X_test, y_pred, color='red', label='Predicted')
    plt.legend()
    plt.title('Actual vs Predicted Values')
    plt.xlabel('X')
    plt.ylabel('y')
    plt.savefig('results.png')
    plt.show()

# Main execution
if __name__ == "__main__":
    # Load data
    data = load_data("data.csv")
    processed_data = preprocess_data(data)
    
    # Prepare features and target
    X = processed_data[['feature', 'feature_squared', 'feature_log']]
    y = processed_data['target']
    
    # Train model
    trainer = ModelTrainer()
    results = trainer.train(X, y)
    
    # Make predictions
    y_pred = trainer.predict(results['X_test'])
    
    # Visualize results
    plot_results(results['X_test'], results['y_test'], y_pred)
    
    # Print metrics
    print(f"Train score: {results['train_score']:.4f}")
    print(f"Test score: {results['test_score']:.4f}")
    
    # Save model
    try:
        import joblib
        joblib.dump(results['model'], 'model.pkl')
        print("Model saved successfully")
    except Exception as e:
        print(f"Error saving model: {e}")
`;

    const result = pythonParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      // Check the overall structure
      const statements = result.result;
      
      // Check imports
      expect(statements[0].type).toBe("import-statement");
      expect(statements[0].module).toBe("pandas");
      expect(statements[0].alias).toBe("pd");
      
      // Check function definitions
      const loadDataFnIndex = statements.findIndex(s => 
        s.type === "function-declaration" && s.name === "load_data");
      expect(loadDataFnIndex).toBeGreaterThan(-1);
      
      const preprocessDataFnIndex = statements.findIndex(s => 
        s.type === "function-declaration" && s.name === "preprocess_data");
      expect(preprocessDataFnIndex).toBeGreaterThan(-1);
      
      // Check class definition
      const classIndex = statements.findIndex(s => 
        s.type === "class-declaration" && s.name === "ModelTrainer");
      expect(classIndex).toBeGreaterThan(-1);
      
      if (statements[classIndex].type === "class-declaration") {
        const classMethods = statements[classIndex].body.filter(
          m => m.type === "function-declaration"
        );
        expect(classMethods.length).toBe(3); // __init__, train, predict
      }
      
      // Check if-statement at the end
      const ifMainIndex = statements.findIndex(s => 
        s.type === "if-statement");
      expect(ifMainIndex).toBeGreaterThan(-1);
      
      if (statements[ifMainIndex].type === "if-statement") {
        // Check the content inside the if __name__ == "__main__" block
        const ifBody = statements[ifMainIndex].consequent;
        expect(ifBody.length).toBeGreaterThan(5);
        
        // Check try-except block
        const tryIndex = ifBody.findIndex(s => s.type === "try-statement");
        expect(tryIndex).toBeGreaterThan(-1);
      }
    }
  });

  it("should parse web application with decorators and complex patterns", () => {
    const input = `
# Web Application Example using Flask
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, jwt_required, create_access_token
import os
import datetime

# Initialize the app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'default-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///app.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key')

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)

# Define models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }

# Define routes
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    
    # Validate input
    if not data or not data.get('username') or not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Missing required fields'}), 400
    
    # Check if user already exists
    if User.query.filter_by(username=data['username']).first() is not None:
        return jsonify({'error': 'Username already taken'}), 400
    
    if User.query.filter_by(email=data['email']).first() is not None:
        return jsonify({'error': 'Email already registered'}), 400
    
    # Create new user
    user = User(
        username=data['username'],
        email=data['email'],
        password=data['password']  # In real app, would hash this
    )
    
    db.session.add(user)
    db.session.commit()
    
    return jsonify({'message': 'User registered successfully'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    
    # Find the user
    user = User.query.filter_by(username=data.get('username')).first()
    
    if user is None or user.password != data.get('password'):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Create access token
    access_token = create_access_token(identity=user.id)
    
    return jsonify({
        'access_token': access_token,
        'user': user.to_dict()
    })

@app.route('/api/users', methods=['GET'])
@jwt_required
def get_users():
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Server error'}), 500

# Run the app
if __name__ == '__main__':
    db.create_all()
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
`;

    const result = pythonParser(input);
    
    expect(result.success).toBe(true);
    if (result.success) {
      // Check the overall structure
      const statements = result.result;
      
      // Check imports
      expect(statements[0].type).toBe("import-statement");
      expect(statements[0].module).toContain("flask");
      
      // Check Flask app initialization
      const appAssignmentIndex = statements.findIndex(s => 
        s.type === "assignment-statement" && 
        s.target.type === "identifier" && 
        s.target.name === "app");
      expect(appAssignmentIndex).toBeGreaterThan(-1);
      
      // Check model definition
      const userClassIndex = statements.findIndex(s => 
        s.type === "class-declaration" && s.name === "User");
      expect(userClassIndex).toBeGreaterThan(-1);
      
      // Count the number of route definitions
      const routeCount = statements.filter(s => 
        s.type === "expression-statement" || 
        (s.type === "assignment-statement" && s.value.type === "call-expression")
      ).length;
      
      // Should have multiple routes
      expect(routeCount).toBeGreaterThan(3);
      
      // Check for the main block
      const ifMainIndex = statements.findIndex(s => 
        s.type === "if-statement");
      expect(ifMainIndex).toBeGreaterThan(-1);
    }
  });
});