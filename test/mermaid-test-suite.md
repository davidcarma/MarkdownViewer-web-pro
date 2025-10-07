# 🧪 Mermaid Diagram Test Suite

## 1. Complex Flowchart with Subgraphs

```mermaid
graph TD
    Start([Start Application]) --> Auth{Authentication}
    Auth -->|Success| Dashboard[Dashboard]
    Auth -->|Failure| Login[Login Page]
    Login --> Auth
    
    Dashboard --> Actions{User Action}
    
    subgraph "Data Processing"
        Actions -->|Upload| Process[Process Data]
        Process --> Validate{Valid?}
        Validate -->|Yes| Store[(Database)]
        Validate -->|No| Error[Show Error]
        Error --> Actions
    end
    
    subgraph "Analytics"
        Store --> Analyze[Analyze Data]
        Analyze --> Visualize[Create Charts]
        Visualize --> Report[Generate Report]
    end
    
    Actions -->|View| Query[Query Data]
    Query --> Store
    Store --> Display[Display Results]
    
    Actions -->|Export| Export[Export to CSV]
    Export --> Download[Download File]
    
    Report --> Share{Share?}
    Share -->|Yes| Email[Send Email]
    Share -->|No| Save[Save Locally]
    
    Display --> End([End])
    Download --> End
    Email --> End
    Save --> End
    
    style Start fill:#a78bfa
    style End fill:#f472b6
    style Store fill:#60a5fa
    style Error fill:#fb923c
```

## 2. Sequence Diagram - User Authentication

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant A as API Gateway
    participant Auth as Auth Service
    participant DB as Database
    participant Cache as Redis Cache
    
    U->>B: Enter credentials
    B->>A: POST /login
    activate A
    A->>Auth: Validate credentials
    activate Auth
    Auth->>Cache: Check cached session
    Cache-->>Auth: Not found
    Auth->>DB: Query user
    activate DB
    DB-->>Auth: User data
    deactivate DB
    Auth->>Auth: Verify password hash
    Auth->>Cache: Store session token
    Auth-->>A: JWT token
    deactivate Auth
    A-->>B: 200 OK + token
    deactivate A
    B->>B: Store token
    B-->>U: Show dashboard
    
    Note over U,Cache: User is now authenticated
    
    U->>B: Make API request
    B->>A: GET /data + token
    activate A
    A->>Cache: Validate token
    Cache-->>A: Valid
    A->>DB: Fetch data
    activate DB
    DB-->>A: Return data
    deactivate DB
    A-->>B: 200 OK + data
    deactivate A
    B-->>U: Display data
```

## 3. Class Diagram - E-commerce System

```mermaid
classDiagram
    class User {
        +String id
        +String email
        +String password
        +String name
        +Date createdAt
        +login()
        +logout()
        +updateProfile()
    }
    
    class Customer {
        +String shippingAddress
        +PaymentMethod[] paymentMethods
        +Order[] orderHistory
        +addToCart()
        +checkout()
        +trackOrder()
    }
    
    class Admin {
        +String role
        +String[] permissions
        +manageProducts()
        +viewAnalytics()
        +processRefunds()
    }
    
    class Product {
        +String id
        +String name
        +String description
        +Float price
        +Int stock
        +Category category
        +Image[] images
        +updateStock()
        +setPrice()
    }
    
    class Order {
        +String id
        +Date orderDate
        +OrderStatus status
        +Float totalAmount
        +ShippingAddress address
        +calculateTotal()
        +updateStatus()
        +cancelOrder()
    }
    
    class OrderItem {
        +String id
        +Int quantity
        +Float priceAtPurchase
        +getSubtotal()
    }
    
    class ShoppingCart {
        +String id
        +CartItem[] items
        +addItem()
        +removeItem()
        +clear()
        +getTotal()
    }
    
    class Payment {
        +String id
        +Float amount
        +PaymentMethod method
        +PaymentStatus status
        +Date processedAt
        +process()
        +refund()
    }
    
    User <|-- Customer
    User <|-- Admin
    Customer "1" --> "1" ShoppingCart
    Customer "1" --> "*" Order
    Order "1" --> "*" OrderItem
    OrderItem "*" --> "1" Product
    Order "1" --> "1" Payment
    Product "*" --> "1" Category
    
    class Category {
        +String id
        +String name
        +Category parent
        +getProducts()
    }
```

## 4. State Diagram - Order Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: Order Created
    
    Pending --> Processing: Payment Confirmed
    Pending --> Cancelled: Customer Cancels
    
    Processing --> Shipped: Items Dispatched
    Processing --> Cancelled: Out of Stock
    
    Shipped --> InTransit: Courier Pickup
    InTransit --> Delivered: Successful Delivery
    InTransit --> Failed: Delivery Failed
    
    Failed --> InTransit: Retry Delivery
    Failed --> Returned: Max Retries Exceeded
    
    Delivered --> Completed: No Issues
    Delivered --> ReturnRequested: Customer Returns
    
    ReturnRequested --> Returned: Return Approved
    ReturnRequested --> Completed: Return Denied
    
    Returned --> Refunded: Refund Processed
    
    Cancelled --> [*]
    Completed --> [*]
    Refunded --> [*]
    
    note right of Processing
        Warehouse processes
        the order items
    end note
    
    note right of Delivered
        Customer has 30 days
        for returns
    end note
```

## 5. Gantt Chart - Project Timeline

```mermaid
gantt
    title Web Application Development Project
    dateFormat YYYY-MM-DD
    section Planning
    Requirements Gathering    :done, req, 2025-01-01, 10d
    System Design            :done, design, after req, 15d
    Architecture Review      :done, review, after design, 5d
    
    section Development
    Frontend Setup           :active, fe1, 2025-02-01, 7d
    Backend API Development  :active, be1, 2025-02-01, 30d
    Database Schema          :done, db1, 2025-02-01, 10d
    Authentication System    :fe2, after db1, 14d
    User Dashboard           :fe3, after fe1, 20d
    Product Management       :fe4, after fe2, 15d
    Shopping Cart            :fe5, after fe3, 12d
    Payment Integration      :be2, after be1, 10d
    
    section Testing
    Unit Tests               :test1, after fe4, 10d
    Integration Tests        :test2, after be2, 12d
    User Acceptance Testing  :test3, after test2, 7d
    Performance Testing      :test4, after test3, 5d
    
    section Deployment
    Staging Deployment       :deploy1, after test4, 3d
    Production Setup         :deploy2, after deploy1, 5d
    Go Live                  :milestone, after deploy2, 1d
```

## 6. ER Diagram - Database Schema

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string customer_id PK
        string email UK
        string name
        string phone
        date registered_at
    }
    
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER {
        string order_id PK
        string customer_id FK
        date order_date
        float total_amount
        string status
    }
    
    ORDER_ITEM }o--|| PRODUCT : references
    ORDER_ITEM {
        string item_id PK
        string order_id FK
        string product_id FK
        int quantity
        float price
    }
    
    PRODUCT ||--o{ REVIEW : has
    PRODUCT {
        string product_id PK
        string name
        string description
        float price
        int stock
        string category_id FK
    }
    
    PRODUCT }o--|| CATEGORY : belongs_to
    CATEGORY {
        string category_id PK
        string name
        string parent_id FK
    }
    
    REVIEW }o--|| CUSTOMER : writes
    REVIEW {
        string review_id PK
        string product_id FK
        string customer_id FK
        int rating
        string comment
        date created_at
    }
    
    ORDER ||--|| PAYMENT : has
    PAYMENT {
        string payment_id PK
        string order_id FK
        float amount
        string method
        string status
        date processed_at
    }
```

## 7. Pie Chart - Sales Distribution

```mermaid
pie title Product Sales by Category
    "Electronics" : 42.5
    "Clothing" : 28.3
    "Home & Garden" : 15.7
    "Books" : 8.2
    "Sports" : 5.3
```

## 8. Git Graph - Version Control Flow

```mermaid
gitGraph
    commit id: "Initial commit"
    commit id: "Add basic structure"
    branch develop
    checkout develop
    commit id: "Setup dev environment"
    branch feature-auth
    checkout feature-auth
    commit id: "Add login page"
    commit id: "Implement JWT"
    checkout develop
    merge feature-auth
    branch feature-dashboard
    checkout feature-dashboard
    commit id: "Create dashboard layout"
    commit id: "Add widgets"
    checkout develop
    merge feature-dashboard
    checkout main
    merge develop tag: "v1.0.0"
    checkout develop
    commit id: "Start v1.1 features"
    branch feature-analytics
    checkout feature-analytics
    commit id: "Add charts"
    commit id: "Implement reports"
    checkout develop
    merge feature-analytics
    checkout main
    merge develop tag: "v1.1.0"
```

## 9. Journey Diagram - User Experience

```mermaid
journey
    title User Shopping Experience
    section Browsing
      Visit Homepage: 5: Customer
      Search Products: 4: Customer
      View Product Details: 5: Customer
    section Selection
      Add to Cart: 5: Customer
      Review Cart: 4: Customer
      Apply Coupon: 3: Customer, System
    section Checkout
      Enter Shipping Info: 3: Customer
      Select Payment: 4: Customer
      Confirm Order: 5: Customer, System
    section Post-Purchase
      Receive Confirmation: 5: Customer, System
      Track Shipment: 4: Customer
      Receive Package: 5: Customer
      Leave Review: 4: Customer
```

---

## Testing Checklist

**Verify the following for each diagram:**

- ✅ **Rendering Quality** - All elements visible and properly aligned
- ✅ **Theming** - Colors adapt to light/dark/Gwyneth themes
- ✅ **Responsiveness** - Diagrams scale appropriately
- ✅ **Performance** - No lag or freezing
- ✅ **Export** - Diagrams appear in PDF/print output
- ✅ **Syntax Highlighting** - Code blocks display correctly
- ✅ **Error Handling** - Invalid diagrams show error messages

**Known Diagram Types Tested:**
1. Flowchart (graph TD) with subgraphs and styling
2. Sequence Diagram with multiple participants
3. Class Diagram with inheritance and relationships
4. State Diagram (v2) with transitions and notes
5. Gantt Chart with sections and milestones
6. ER Diagram (Entity Relationship)
7. Pie Chart with percentages
8. Git Graph with branches and merges
9. Journey Diagram with user experience flow

---

**Tips for Testing:**
- Open this file in the Markdown Editor
- Toggle between Edit and Preview modes
- Try all three themes (Light, Dark, Gwyneth)
- Export to PDF and verify diagrams render
- Test with image collapse feature
- Check performance with all diagrams visible

